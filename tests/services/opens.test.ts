// D28: the open log (every open, grouped into visits per device) and "Copy link" counting as sent.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { activityLog, emailQueue, invitationOpens, invitations } from "@/server/db/schema";
import { getInvitationDetail, listInvitations, listRecentOpens } from "@/server/services/admin/guests";
import { OPEN_VISIT_GAP_MS, recordView } from "@/server/services/invitation-page";
import { queueReminders } from "@/server/services/reminders";
import { markLinkCopied } from "@/server/services/whatsapp";
import { daysAgo } from "@/server/utils/dates";
import { adminCtx } from "../helpers/admin";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const T0 = new Date("2026-11-02T09:00:00+03:00");
const later = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60 * 1000;

async function setup(status: "draft" | "sent" | "revoked" = "sent") {
  const wedding = await createWedding(db);
  const { invitation, token } = await createInvitation(db, wedding.id, { status });
  const opens = () => db.select().from(invitationOpens).where(eq(invitationOpens.invitationId, invitation.id)).orderBy(invitationOpens.openedAt);
  const reload = async () => (await db.select().from(invitations).where(eq(invitations.id, invitation.id)))[0];
  return { wedding, invitation, token, opens, reload };
}

describe("D28: open log", () => {
  it("records each open with its device", async () => {
    const { token, opens } = await setup();
    await recordView(db, token, { viewer: "guest", device: "iPhone", now: T0 });
    expect(await opens()).toMatchObject([{ device: "iPhone", openedAt: T0, lastSeenAt: T0, taps: 1 }]);
  });

  it("taps on the same device within 30 minutes of the last one are one visit", async () => {
    const { token, opens } = await setup();
    await recordView(db, token, { viewer: "guest", device: "iPhone", now: T0 });
    await recordView(db, token, { viewer: "guest", device: "iPhone", now: later(20 * MIN) });
    await recordView(db, token, { viewer: "guest", device: "iPhone", now: later(45 * MIN) }); // 25 min after the last tap
    expect(await opens()).toMatchObject([{ openedAt: T0, lastSeenAt: later(45 * MIN), taps: 3 }]);
  });

  it("a gap of 30 minutes or more starts a new visit", async () => {
    const { token, opens } = await setup();
    await recordView(db, token, { viewer: "guest", device: "iPhone", now: T0 });
    await recordView(db, token, { viewer: "guest", device: "iPhone", now: later(OPEN_VISIT_GAP_MS) });
    expect((await opens()).map((o) => o.openedAt)).toEqual([T0, later(OPEN_VISIT_GAP_MS)]);
  });

  it("another device is another visit, even at the same time (a forwarded link shows up)", async () => {
    const { token, opens } = await setup();
    await recordView(db, token, { viewer: "guest", device: "iPhone", now: T0 });
    await recordView(db, token, { viewer: "guest", device: "Windows computer", now: later(MIN) });
    expect((await opens()).map((o) => o.device)).toEqual(["iPhone", "Windows computer"]);
  });

  it("E27: the couple's own opens are not logged", async () => {
    const { token, opens } = await setup();
    await recordView(db, token, { viewer: "admin", device: "Mac", now: T0 });
    expect(await opens()).toEqual([]);
  });

  it("an unknown link logs nothing", async () => {
    await expect(recordView(db, "x".repeat(43), { viewer: "guest", device: "iPhone", now: T0 })).resolves.toBeUndefined();
  });

  it("without a device label the open is still logged", async () => {
    const { token, opens } = await setup();
    await recordView(db, token, { viewer: "guest", now: T0 });
    expect(await opens()).toMatchObject([{ device: "Unknown device" }]);
  });

  it("the activity timeline still has only the first view", async () => {
    const { token, invitation } = await setup();
    await recordView(db, token, { viewer: "guest", device: "iPhone", now: T0 });
    await recordView(db, token, { viewer: "guest", device: "iPhone", now: later(2 * OPEN_VISIT_GAP_MS) });
    const logs = await db.select().from(activityLog).where(eq(activityLog.invitationId, invitation.id));
    expect(logs.map((l) => l.action)).toEqual(["viewed"]);
  });
});

describe("D28: the admin sees the opens", () => {
  it("guest list: visits and distinct devices per guest; detail: every visit, newest first", async () => {
    const { wedding, invitation, token } = await setup();
    const quiet = await createInvitation(db, wedding.id, { status: "sent", fullName: "Not Opened", phone: "+254700000001" });
    await recordView(db, token, { viewer: "guest", device: "iPhone", now: T0 });
    await recordView(db, token, { viewer: "guest", device: "Mac", now: later(MIN) });
    await recordView(db, token, { viewer: "guest", device: "iPhone", now: later(3 * OPEN_VISIT_GAP_MS) });
    const ctx = await adminCtx(db, wedding.id);

    const rows = await listInvitations(db, ctx);
    expect(rows.find((r) => r.id === invitation.id)).toMatchObject({ openCount: 3, openDevices: 2, lastViewedAt: later(3 * OPEN_VISIT_GAP_MS) });
    expect(rows.find((r) => r.id === quiet.invitation.id)).toMatchObject({ openCount: 0, openDevices: 0 });

    const detail = await getInvitationDetail(db, ctx, invitation.id);
    expect(detail.opens.map((o) => [o.device, o.openedAt])).toEqual([
      ["iPhone", later(3 * OPEN_VISIT_GAP_MS)],
      ["Mac", later(MIN)],
      ["iPhone", T0],
    ]);
  });

  it("recently opened: newest visit first, only this wedding", async () => {
    const a = await setup();
    const b = await createInvitation(db, a.wedding.id, { status: "sent", fullName: "Second Guest", phone: "+254700000002" });
    const other = await setup(); // another wedding
    await recordView(db, a.token, { viewer: "guest", device: "iPhone", now: T0 });
    await recordView(db, b.token, { viewer: "guest", device: "Android phone", now: later(5 * MIN) });
    await recordView(db, other.token, { viewer: "guest", device: "Mac", now: later(10 * MIN) });

    const recent = await listRecentOpens(db, await adminCtx(db, a.wedding.id));
    expect(recent.map((r) => [r.fullName, r.device])).toEqual([
      ["Second Guest", "Android phone"],
      ["Test Guest", "iPhone"],
    ]);
  });
});

describe("D28: Copy link counts as sent", () => {
  it("moves a draft to SENT, records the time and logs it", async () => {
    const { wedding, invitation, reload } = await setup("draft");
    const ctx = await adminCtx(db, wedding.id);
    expect(await markLinkCopied(db, ctx, invitation.id, T0)).toBe("sent");
    expect(await reload()).toMatchObject({ status: "sent", linkCopiedAt: T0 });
    const [log] = await db.select().from(activityLog).where(eq(activityLog.invitationId, invitation.id));
    expect(log).toMatchObject({ action: "send", actor: "admin", meta: { from: "draft", to: "sent", channel: "copy" } });
  });

  it("keeps a later status and only updates the time", async () => {
    const { wedding, invitation, token, reload } = await setup("sent");
    await recordView(db, token, { viewer: "guest", device: "iPhone", now: T0 });
    const ctx = await adminCtx(db, wedding.id);
    expect(await markLinkCopied(db, ctx, invitation.id, later(MIN))).toBe("viewed");
    expect(await reload()).toMatchObject({ status: "viewed", linkCopiedAt: later(MIN) });
  });

  it("refuses a revoked invitation", async () => {
    const { wedding, invitation, reload } = await setup("revoked");
    await expect(markLinkCopied(db, await adminCtx(db, wedding.id), invitation.id, T0)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await reload()).toMatchObject({ status: "revoked", linkCopiedAt: null });
  });

  it("is scoped to the admin's wedding", async () => {
    const mine = await setup("draft");
    const theirs = await setup("draft");
    await expect(markLinkCopied(db, await adminCtx(db, mine.wedding.id), theirs.invitation.id, T0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await theirs.reload()).toMatchObject({ status: "draft", linkCopiedAt: null });
  });

  it("a guest whose link was copied gets the no-response reminder like the other channels (D17)", async () => {
    const wedding = await createWedding(db);
    const now = new Date("2026-11-01T09:00:00+03:00");
    const { invitation } = await createInvitation(db, wedding.id, { status: "sent", email: "copied@example.com", linkCopiedAt: daysAgo(now, 4) });
    await createInvitation(db, wedding.id, { status: "sent", email: "recent@example.com", phone: "+254700000003", linkCopiedAt: daysAgo(now, 1) });
    expect((await queueReminders(db, wedding, now)).noResponse).toBe(1);
    const queued = await db.select().from(emailQueue).where(eq(emailQueue.weddingId, wedding.id));
    expect(queued.map((q) => q.invitationId)).toEqual([invitation.id]);
  });
});
