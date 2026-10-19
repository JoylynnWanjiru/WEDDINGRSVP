// BR-1 to BR-4 and PROJECT_SPEC §4a: each state sees exactly its access level.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { inviteTokenFor } from "@/server/auth/tokens";
import type { Db } from "@/server/db/client";
import { invitations, weddings } from "@/server/db/schema";
import { INVITATION_STATUSES, type InvitationStatus } from "@/server/domain/status";
import { getAccess, requireApproved, type AccessLevel } from "@/server/services/access";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;
let weddingId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  weddingId = (await createWedding(db)).id;
});
afterAll(() => close());

const EXPECTED: Record<InvitationStatus, AccessLevel> = {
  draft: "invited",
  sent: "invited",
  viewed: "invited",
  awaiting_approval: "invited", // said Yes: still nothing unlocked
  declined: "declined",
  not_approved: "not_approved",
  approved: "approved", // whether or not the pass email went out (D2)
  partially_arrived: "approved",
  arrived: "approved",
  revoked: "revoked",
};

describe("getAccess", () => {
  it.each(INVITATION_STATUSES)("status %s → expected access level", async (status) => {
    const { token } = await createInvitation(db, weddingId, { status });
    expect((await getAccess(db, token)).level).toBe(EXPECTED[status]);
  });

  it("BR-4: no token, malformed tokens and unknown tokens all look like public", async () => {
    const unknown = inviteTokenFor("00000000-0000-0000-0000-000000000000", 1);
    for (const t of [undefined, null, "", "abc", "' OR 1=1 --", unknown]) {
      expect(await getAccess(db, t)).toEqual({ level: "public" });
    }
  });

  it("an old link stops working once the link is rotated", async () => {
    const { invitation, token } = await createInvitation(db, weddingId, { status: "approved" });
    const { hashToken } = await import("@/server/auth/tokens");
    const newToken = inviteTokenFor(invitation.id, 2);
    await db
      .update(invitations)
      .set({ inviteTokenVersion: 2, inviteTokenHash: hashToken(newToken) })
      .where(eq(invitations.id, invitation.id));
    expect((await getAccess(db, token)).level).toBe("public");
    expect((await getAccess(db, newToken)).level).toBe("approved");
  });

  it("BR-3: access follows the database immediately (revoke takes effect on the next call)", async () => {
    const { invitation, token } = await createInvitation(db, weddingId, { status: "approved" });
    expect((await getAccess(db, token)).level).toBe("approved");
    await db.update(invitations).set({ status: "revoked" }).where(eq(invitations.id, invitation.id));
    expect((await getAccess(db, token)).level).toBe("revoked");
  });

  it("after the post-wedding purge every link looks public", async () => {
    const wedding = await createWedding(db);
    const { token } = await createInvitation(db, wedding.id, { status: "approved" });
    await db.update(weddings).set({ purgedAt: new Date() }).where(eq(weddings.id, wedding.id));
    expect((await getAccess(db, token)).level).toBe("public");
  });
});

describe("requireApproved", () => {
  it("returns the invitation and wedding for approved states", async () => {
    for (const status of ["approved", "partially_arrived", "arrived"] as const) {
      const { invitation, token } = await createInvitation(db, weddingId, { status });
      const result = await requireApproved(db, token);
      expect(result.invitation.id).toBe(invitation.id);
      expect(result.wedding.id).toBe(weddingId);
    }
  });

  it("BR-1/2: throws FORBIDDEN (403) for every other state and for no token", async () => {
    const locked = INVITATION_STATUSES.filter((s) => EXPECTED[s] !== "approved");
    for (const status of locked) {
      const { token } = await createInvitation(db, weddingId, { status });
      await expect(requireApproved(db, token)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
    await expect(requireApproved(db, undefined)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
