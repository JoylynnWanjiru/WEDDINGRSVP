// Module 4: the couple's decisions (U6, §5a, BR-3, BR-10, BR-11, E22).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { activityLog, emailQueue, invitations, weddings } from "@/server/db/schema";
import { getAccess } from "@/server/services/access";
import {
  approveInvitation,
  declineAttendance,
  getApprovalQueue,
  reopenAttendance,
  restoreInvitation,
  revokeInvitation,
} from "@/server/services/admin/approvals";
import { adminCtx } from "../../helpers/admin";
import { createInvitation, createTestDb, createWedding } from "../../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

async function setup(values: Parameters<typeof createInvitation>[2] = {}) {
  const wedding = await createWedding(db);
  const ctx = await adminCtx(db, wedding.id);
  const { invitation, token } = await createInvitation(db, wedding.id, { status: "awaiting_approval", ...values });
  const reload = async () => (await db.select().from(invitations).where(eq(invitations.id, invitation.id)))[0];
  return { wedding, ctx, invitation, token, reload };
}

describe("approve", () => {
  it("unlocks the guest, stamps approvedAt, queues the pass email and logs the admin", async () => {
    const { ctx, invitation, token, reload } = await setup({ email: "guest@example.com", partySize: 2 });
    const now = new Date("2026-10-21T08:00:00Z");
    expect(await approveInvitation(db, ctx, invitation.id, { now })).toEqual({ status: "approved", overflow: 0 });
    expect((await reload()).approvedAt).toEqual(now);
    expect((await getAccess(db, token)).level).toBe("approved");
    const [email] = await db.select().from(emailQueue).where(eq(emailQueue.invitationId, invitation.id));
    expect(email.template).toBe("approval_pass");
    const [log] = await db.select().from(activityLog).where(eq(activityLog.invitationId, invitation.id));
    expect(log).toMatchObject({ actor: "admin", actorLabel: "Test Admin", action: "approve", meta: expect.objectContaining({ from: "awaiting_approval", to: "approved" }) });
  });

  it("only from awaiting_approval (approval is never automatic, A1)", async () => {
    for (const status of ["draft", "sent", "viewed", "declined", "approved", "revoked"] as const) {
      const { ctx, invitation } = await setup({ status });
      await expect(approveInvitation(db, ctx, invitation.id)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    }
  });

  it("BR-11: over capacity needs a second confirmation, then goes through", async () => {
    const { wedding, ctx, invitation } = await setup({ partySize: 3 });
    await db.update(weddings).set({ venueCapacity: 4 }).where(eq(weddings.id, wedding.id));
    await createInvitation(db, wedding.id, { status: "approved", partySize: 2 });
    await expect(approveInvitation(db, ctx, invitation.id)).rejects.toMatchObject({
      code: "CONFLICT",
      details: { overflow: 1, needsConfirmation: true },
    });
    expect(await approveInvitation(db, ctx, invitation.id, { confirmOverCapacity: true })).toEqual({ status: "approved", overflow: 1 });
  });

  it("another wedding's guest is NOT_FOUND (scoping)", async () => {
    const { invitation } = await setup();
    const other = await createWedding(db);
    await expect(approveInvitation(db, await adminCtx(db, other.id), invitation.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("decline and reopen", () => {
  it("awaiting → not_approved → awaiting", async () => {
    const { ctx, invitation, token } = await setup();
    expect(await declineAttendance(db, ctx, invitation.id, { reason: "capacity" })).toBe("not_approved");
    expect((await getAccess(db, token)).level).toBe("not_approved");
    expect(await reopenAttendance(db, ctx, invitation.id)).toBe("awaiting_approval");
  });
});

describe("revoke and restore", () => {
  it("BR-3: revoking locks the guest out at once and bumps the pass version", async () => {
    const { ctx, invitation, token, reload } = await setup({ status: "approved" });
    expect(await revokeInvitation(db, ctx, invitation.id, { reason: "duplicate" })).toBe("revoked");
    expect((await getAccess(db, token)).level).toBe("revoked");
    expect(await reload()).toMatchObject({ statusBeforeRevoke: "approved", passVersion: 2 });
  });

  it("E22: restore returns to the previous state; the old pass version stays dead", async () => {
    const { ctx, invitation, token, reload } = await setup({ status: "approved" });
    await revokeInvitation(db, ctx, invitation.id);
    expect(await restoreInvitation(db, ctx, invitation.id)).toBe("approved");
    expect((await getAccess(db, token)).level).toBe("approved");
    expect(await reload()).toMatchObject({ statusBeforeRevoke: null, revokedAt: null, passVersion: 2 });
  });

  it("can't revoke someone who has already arrived", async () => {
    const { ctx, invitation } = await setup({ status: "arrived" });
    await expect(revokeInvitation(db, ctx, invitation.id)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("notifies the guest only when asked", async () => {
    const { ctx, invitation } = await setup({ email: "guest@example.com" });
    await revokeInvitation(db, ctx, invitation.id);
    expect(await db.select().from(emailQueue).where(eq(emailQueue.invitationId, invitation.id))).toHaveLength(0);
    await restoreInvitation(db, ctx, invitation.id);
    await revokeInvitation(db, ctx, invitation.id, { notifyGuest: true });
    const [email] = await db.select().from(emailQueue).where(eq(emailQueue.invitationId, invitation.id));
    expect(email.template).toBe("revoked");
  });
});

describe("approval queue", () => {
  it("lists awaiting guests oldest first with capacity context", async () => {
    const wedding = await createWedding(db);
    const ctx = await adminCtx(db, wedding.id);
    await createInvitation(db, wedding.id, { status: "awaiting_approval", fullName: "Later", respondedAt: new Date("2026-10-21T00:00:00Z") });
    await createInvitation(db, wedding.id, { status: "awaiting_approval", fullName: "Earlier", respondedAt: new Date("2026-10-20T00:00:00Z") });
    await createInvitation(db, wedding.id, { status: "approved", partySize: 4 });
    const q = await getApprovalQueue(db, ctx);
    expect(q.queue.map((r) => r.fullName)).toEqual(["Earlier", "Later"]);
    expect(q).toMatchObject({ capacity: 300, approvedHeadcount: 4 });
  });
});
