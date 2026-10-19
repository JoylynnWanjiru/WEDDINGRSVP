// Module 6: the couple's gate controls (E26, §7 one-way actions).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { loginUsher, requireUsher } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { activityLog, checkIns, invitations } from "@/server/db/schema";
import { changeUsherPin, correctArrivals, signOutUshers } from "@/server/services/admin/gate";
import { admit, passTokenFor, scanUrl } from "@/server/services/gate";
import { adminCtx } from "../../helpers/admin";
import { createInvitation, createTestDb, createWedding } from "../../helpers/db";
import { usherFor } from "../../helpers/usher";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const DAY = { now: new Date("2026-12-12T12:00:00+03:00") };

describe("E26: PIN and sign-out", () => {
  it("changing the PIN ends every scanner session and is logged without the PIN", async () => {
    const wedding = await createWedding(db);
    const ctx = await adminCtx(wedding.id);
    await changeUsherPin(db, ctx, "1111");
    const session = await loginUsher(db, wedding.id, "1111", "Gate 1");
    await changeUsherPin(db, ctx, "2222");
    await expect(requireUsher(db, session)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const logs = await db.select().from(activityLog).where(eq(activityLog.weddingId, wedding.id));
    expect(JSON.stringify(logs)).not.toMatch(/1111|2222/);
  });

  it("'sign out all ushers' keeps the PIN", async () => {
    const wedding = await createWedding(db);
    const ctx = await adminCtx(wedding.id);
    await changeUsherPin(db, ctx, "1111");
    const session = await loginUsher(db, wedding.id, "1111", "Gate 1");
    await signOutUshers(db, ctx);
    await expect(requireUsher(db, session)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(requireUsher(db, await loginUsher(db, wedding.id, "1111", "Gate 1"))).resolves.toBeTruthy();
  });
});

describe("§7: correcting arrivals", () => {
  it("fixes the count and status, keeps the original check-in rows, and logs the reason", async () => {
    const wedding = await createWedding(db);
    const ctx = await adminCtx(wedding.id);
    const usher = await usherFor(db, wedding.id);
    const { invitation } = await createInvitation(db, wedding.id, { status: "approved", partySize: 3 });
    await admit(db, usher, { scanned: scanUrl(await passTokenFor(invitation)) }, 3, DAY); // mis-tap: only 2 came

    expect(await correctArrivals(db, ctx, invitation.id, 2, "Usher tapped 3, only 2 arrived")).toBe("partially_arrived");
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, invitation.id));
    expect(inv.arrivedCount).toBe(2);
    expect(await db.select().from(checkIns).where(eq(checkIns.invitationId, invitation.id))).toHaveLength(1);
    const logs = await db.select().from(activityLog).where(eq(activityLog.invitationId, invitation.id));
    expect(logs.at(-1)).toMatchObject({ actor: "admin", action: "correct_arrivals", meta: expect.objectContaining({ arrivedFrom: 3, arrivedTo: 2 }) });

    expect(await correctArrivals(db, ctx, invitation.id, 0, "Nobody came")).toBe("approved");
  });

  it("needs a reason, a count within the party, and an approved guest", async () => {
    const wedding = await createWedding(db);
    const ctx = await adminCtx(wedding.id);
    const { invitation } = await createInvitation(db, wedding.id, { status: "approved", partySize: 2 });
    await expect(correctArrivals(db, ctx, invitation.id, 1, " ")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(correctArrivals(db, ctx, invitation.id, 3, "x")).rejects.toMatchObject({ code: "VALIDATION" });
    const pending = await createInvitation(db, wedding.id, { status: "awaiting_approval" });
    await expect(correctArrivals(db, ctx, pending.invitation.id, 0, "x")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});
