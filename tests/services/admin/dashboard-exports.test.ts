// Module 4: dashboard totals (U10, E25) and CSV exports (N4).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { activityLog, invitationRequests, partyMembers } from "@/server/db/schema";
import { getDashboard } from "@/server/services/admin/dashboard";
import { exportCsv } from "@/server/services/admin/exports";
import { parseCsv } from "@/server/utils/csv";
import { eq } from "drizzle-orm";
import { adminCtx } from "../../helpers/admin";
import { createInvitation, createTestDb, createWedding } from "../../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

/** A small wedding with one guest in each interesting state. */
async function scenario() {
  const wedding = await createWedding(db);
  const ctx = await adminCtx(db, wedding.id);
  const add = (v: Parameters<typeof createInvitation>[2]) => createInvitation(db, wedding.id, v);
  const party = (invitationId: string, members: { fullName: string; isChild?: boolean; dietary?: "none" | "vegan" | "halal" }[]) =>
    db.insert(partyMembers).values(members.map((m, i) => ({ invitationId, isPrimary: i === 0, ...m })));

  await add({ status: "draft", fullName: "Draft Guest" });
  await add({ status: "sent", fullName: "Sent Guest" });
  await add({ status: "viewed", fullName: "Viewed Guest", firstViewedAt: new Date() });
  await add({ status: "awaiting_approval", fullName: "Waiting Guest", firstViewedAt: new Date(), respondedAt: new Date(), partySize: 2 });
  const a = await add({ status: "approved", fullName: "Approved Family", group: "Family", firstViewedAt: new Date(), respondedAt: new Date(), partySize: 3 });
  await party(a.invitation.id, [{ fullName: "Mum", dietary: "vegan" }, { fullName: "Dad", dietary: "halal" }, { fullName: "Kid", isChild: true }]);
  const b = await add({ status: "partially_arrived", fullName: "Arriving Friend", group: "Friends", firstViewedAt: new Date(), respondedAt: new Date(), partySize: 2, arrivedCount: 1 });
  await party(b.invitation.id, [{ fullName: "=cmd|' /C calc'!A0" }, { fullName: "Friend Two", dietary: "vegan" }]);
  await add({ status: "declined", fullName: "Declined Guest", firstViewedAt: new Date(), respondedAt: new Date() });
  await add({ status: "revoked", fullName: "Revoked Guest" });
  await db.insert(invitationRequests).values({ weddingId: wedding.id, fullName: "Requester", email: "r@example.com" });
  return { wedding, ctx };
}

describe("getDashboard", () => {
  it("cards, headcount (adults/children), dietary tallies and arrivals match the data", async () => {
    const { ctx } = await scenario();
    const d = await getDashboard(db, ctx);
    expect(d.cards).toEqual({
      invited: 7, // everyone except the revoked guest
      viewed: 5,
      notYetViewed: 1, // sent but not viewed (drafts aren't sent yet)
      awaitingApproval: 1,
      approved: 2,
      declined: 1,
      notApproved: 0,
      noResponse: 3, // draft, sent, viewed
      requests: 1,
      revoked: 1,
    });
    expect(d.headcount).toEqual({ approved: 5, adults: 4, children: 1, capacity: 300, overCapacityBy: 0, arrived: 1 });
    expect(d.dietary).toMatchObject({ none: 2, vegan: 2, halal: 1 });
  });
});

describe("exportCsv", () => {
  it("dietary list: approved guests only, with formula injection neutralised", async () => {
    const { ctx } = await scenario();
    const { csv } = await exportCsv(db, ctx, "dietary");
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(["Guest", "Party", "Child", "Dietary", "Notes"]);
    expect(rows.slice(1).map((r) => r[0]).sort()).toEqual(["'=cmd|' /C calc'!A0", "Dad", "Friend Two", "Kid", "Mum"].sort());
  });

  it("headcount by group", async () => {
    const { ctx } = await scenario();
    const rows = parseCsv((await exportCsv(db, ctx, "headcount")).csv);
    const family = rows.find((r) => r[0] === "Family");
    expect(family).toEqual(["Family", "1", "3", "2", "1"]);
  });

  it("guest list includes everyone; unknown kinds are NOT_FOUND; every export is logged", async () => {
    const { wedding, ctx } = await scenario();
    expect(parseCsv((await exportCsv(db, ctx, "guests")).csv)).toHaveLength(1 + 8);
    expect(parseCsv((await exportCsv(db, ctx, "checkins")).csv)).toHaveLength(1 + 2);
    await expect(exportCsv(db, ctx, "passwords")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const logs = await db.select().from(activityLog).where(eq(activityLog.weddingId, wedding.id));
    expect(logs.filter((l) => l.action === "exported").map((l) => l.meta)).toEqual([{ kind: "guests" }, { kind: "checkins" }]);
  });
});
