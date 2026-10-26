// BR-23 / Kenya DPA: deleting all guest data.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { activityLog, invitationRequests, invitations, partyMembers, programmeItems, weddings } from "@/server/db/schema";
import { getAccess } from "@/server/services/access";
import { PURGE_CONFIRMATION, purgeGuestData, purgeGuestDataAsAdmin } from "@/server/services/purge";
import { adminCtx } from "../helpers/admin";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

async function populated() {
  const wedding = await createWedding(db);
  const { invitation, token } = await createInvitation(db, wedding.id, { status: "approved", phone: "+254700000901" });
  await db.insert(partyMembers).values({ invitationId: invitation.id, fullName: "Guest", isPrimary: true });
  await db.insert(invitationRequests).values({ weddingId: wedding.id, fullName: "Requester", email: "r@example.com" });
  return { wedding, invitation, token };
}

describe("purge", () => {
  it("admins must type the confirmation phrase", async () => {
    const { wedding } = await populated();
    const ctx = await adminCtx(db, wedding.id);
    await expect(purgeGuestDataAsAdmin(db, ctx, "yes")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.select().from(invitations).where(eq(invitations.weddingId, wedding.id))).toHaveLength(1);
  });

  it("removes every guest record, keeps wedding content, and every link becomes public", async () => {
    const { wedding, invitation, token } = await populated();
    const ctx = await adminCtx(db, wedding.id);
    expect(await purgeGuestDataAsAdmin(db, ctx, PURGE_CONFIRMATION)).toEqual({ invitations: 1, requests: 1, vendors: 0 });

    expect(await db.select().from(invitations).where(eq(invitations.weddingId, wedding.id))).toHaveLength(0);
    expect(await db.select().from(partyMembers).where(eq(partyMembers.invitationId, invitation.id))).toHaveLength(0);
    expect(await db.select().from(invitationRequests).where(eq(invitationRequests.weddingId, wedding.id))).toHaveLength(0);
    expect((await getAccess(db, token)).level).toBe("public");
    expect(await db.select().from(programmeItems).where(eq(programmeItems.weddingId, wedding.id))).toHaveLength(19);
    const [w] = await db.select().from(weddings).where(eq(weddings.id, wedding.id));
    expect(w.purgedAt).toBeInstanceOf(Date);

    // Only the purge record itself remains, with counts and no personal data.
    const logs = await db.select().from(activityLog).where(eq(activityLog.weddingId, wedding.id));
    expect(logs.map((l) => [l.action, l.meta])).toEqual([["guest_data_purged", { invitations: 1, requests: 1, vendors: 0 }]]);
  });

  it("the post-wedding cron can run it as system without a phrase", async () => {
    const { wedding } = await populated();
    expect(await purgeGuestData(db, wedding.id, { actor: "system" })).toEqual({ invitations: 1, requests: 1, vendors: 0 });
  });

  it("only touches the given wedding", async () => {
    const a = await populated();
    const b = await populated();
    await purgeGuestData(db, a.wedding.id, { actor: "system" });
    expect(await db.select().from(invitations).where(eq(invitations.weddingId, b.wedding.id))).toHaveLength(1);
  });
});
