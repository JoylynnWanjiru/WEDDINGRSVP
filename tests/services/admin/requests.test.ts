// Module 4: reviewing public requests (§5b, D3, E13).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { inviteTokenFor } from "@/server/auth/tokens";
import type { Db } from "@/server/db/client";
import { invitationRequests, invitations } from "@/server/db/schema";
import { getAccess } from "@/server/services/access";
import { acceptRequest, listRequests, rejectRequest, reopenRequest } from "@/server/services/admin/requests";
import { adminCtx } from "../../helpers/admin";
import { createInvitation, createTestDb, createWedding } from "../../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

async function setup(request: Partial<typeof invitationRequests.$inferInsert> = {}) {
  const wedding = await createWedding(db);
  const ctx = await adminCtx(wedding.id);
  const [r] = await db
    .insert(invitationRequests)
    .values({ weddingId: wedding.id, fullName: "Asking Guest", phone: "+254700000601", ...request })
    .returning();
  return { wedding, ctx, request: r };
}

describe("acceptRequest", () => {
  it("creates a DRAFT invitation with its own working link, and links the request", async () => {
    const { ctx, request } = await setup();
    const res = await acceptRequest(db, ctx, request.id, { seatAllowance: 1 });
    expect(res.created).toBe(true);
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, res.invitationId));
    expect(inv).toMatchObject({ status: "draft", source: "request", fullName: "Asking Guest", phone: "+254700000601", seatAllowance: 1 });
    expect((await getAccess(db, inviteTokenFor(inv.id, 1))).level).toBe("invited");
    const [r] = await db.select().from(invitationRequests).where(eq(invitationRequests.id, request.id));
    expect(r).toMatchObject({ status: "accepted", invitationId: inv.id });
  });

  it("E13: if the person is already invited, links to that guest instead of duplicating", async () => {
    const { wedding, ctx, request } = await setup({ phone: "+254700000602" });
    const { invitation } = await createInvitation(db, wedding.id, { phone: "+254700000602" });
    expect(await acceptRequest(db, ctx, request.id)).toEqual({ invitationId: invitation.id, created: false });
    expect(await db.select().from(invitations).where(eq(invitations.weddingId, wedding.id))).toHaveLength(1);
  });

  it("matches an existing guest by email when there is no phone (case-insensitive)", async () => {
    const { wedding, ctx, request } = await setup({ phone: null, email: "Guest@Example.com" });
    const { invitation } = await createInvitation(db, wedding.id, { email: "guest@example.com" });
    expect((await acceptRequest(db, ctx, request.id)).invitationId).toBe(invitation.id);
  });

  it("an accepted request can't be accepted, rejected or reopened again", async () => {
    const { ctx, request } = await setup();
    await acceptRequest(db, ctx, request.id);
    await expect(acceptRequest(db, ctx, request.id)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(rejectRequest(db, ctx, request.id)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(reopenRequest(db, ctx, request.id)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("another wedding's request is NOT_FOUND", async () => {
    const { request } = await setup();
    const other = await createWedding(db);
    await expect(acceptRequest(db, await adminCtx(other.id), request.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("reject / reopen / list", () => {
  it("reject → rejected (with internal note) → reopen → pending", async () => {
    const { ctx, request } = await setup();
    expect(await rejectRequest(db, ctx, request.id, { note: "unknown" })).toBe("rejected");
    expect(await reopenRequest(db, ctx, request.id)).toBe("pending");
  });

  it("flags pending requests from people already invited (E13)", async () => {
    const { wedding, ctx } = await setup({ phone: "+254700000603", fullName: "Dup" });
    await db.insert(invitationRequests).values({ weddingId: wedding.id, fullName: "New", phone: "+254700000604" });
    const { invitation } = await createInvitation(db, wedding.id, { phone: "+254700000603", fullName: "Invited Already" });
    const list = await listRequests(db, ctx, { status: "pending" });
    const byName = Object.fromEntries(list.map((r) => [r.fullName, r.alreadyInvited]));
    expect(byName.Dup).toEqual({ id: invitation.id, fullName: "Invited Already" });
    expect(byName.New).toBeNull();
  });
});
