import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { invitationRequests, invitations, partyMembers, programmeItems } from "@/server/db/schema";
import type { Db } from "@/server/db/client";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("seed", () => {
  it("creates a wedding with the BLUEPRINT §11 defaults and the full programme", async () => {
    const wedding = await createWedding(db);
    expect(wedding.dailyEmailCap).toBe(400);
    expect(wedding.reminderIntervalDays).toBe(3);
    expect(wedding.purgeAfterDays).toBe(30);
    expect(wedding.defaultSeatAllowance).toBe(0);
    expect(wedding.rsvpDeadline.toISOString()).toBe("2026-11-14T20:59:59.000Z");
    const items = await db.select().from(programmeItems).where(eq(programmeItems.weddingId, wedding.id));
    expect(items).toHaveLength(19);
  });
});

describe("database constraints", () => {
  it("BR-21: two invitations can't share a phone within one wedding", async () => {
    const wedding = await createWedding(db);
    await createInvitation(db, wedding.id, { phone: "+254700000001" });
    await expect(createInvitation(db, wedding.id, { phone: "+254700000001" })).rejects.toThrow();
  });

  it("BR-21: the same phone is fine in a different wedding, and many invitations may have no phone", async () => {
    const a = await createWedding(db);
    const b = await createWedding(db);
    await createInvitation(db, a.id, { phone: "+254700000002" });
    await expect(createInvitation(db, b.id, { phone: "+254700000002" })).resolves.toBeTruthy();
    await createInvitation(db, a.id);
    await expect(createInvitation(db, a.id)).resolves.toBeTruthy();
  });

  it("D3: requests may share a phone with each other and with an invitation (spam can't block a guest)", async () => {
    const wedding = await createWedding(db);
    const phone = "+254700000003";
    const row = { weddingId: wedding.id, fullName: "Requester", phone };
    await db.insert(invitationRequests).values(row);
    await expect(db.insert(invitationRequests).values(row)).resolves.toBeTruthy();
    await expect(createInvitation(db, wedding.id, { phone })).resolves.toBeTruthy();
  });

  it("BR-14: arrived_count can never exceed party_size", async () => {
    const wedding = await createWedding(db);
    const { invitation } = await createInvitation(db, wedding.id, { partySize: 2 });
    await db.update(invitations).set({ arrivedCount: 2 }).where(eq(invitations.id, invitation.id));
    await expect(
      db.update(invitations).set({ arrivedCount: sql`${invitations.arrivedCount} + 1` }).where(eq(invitations.id, invitation.id)),
    ).rejects.toThrow();
  });

  it("allows only one primary party member per invitation", async () => {
    const wedding = await createWedding(db);
    const { invitation } = await createInvitation(db, wedding.id);
    await db.insert(partyMembers).values({ invitationId: invitation.id, fullName: "A", isPrimary: true });
    await db.insert(partyMembers).values({ invitationId: invitation.id, fullName: "B", isPrimary: false });
    await expect(
      db.insert(partyMembers).values({ invitationId: invitation.id, fullName: "C", isPrimary: true }),
    ).rejects.toThrow();
  });

  it("rejects a status outside the §5 lifecycle", async () => {
    const wedding = await createWedding(db);
    const { invitation } = await createInvitation(db, wedding.id);
    await expect(
      db.execute(sql`UPDATE invitations SET status = 'pass_issued' WHERE id = ${invitation.id}`),
    ).rejects.toThrow();
  });
});
