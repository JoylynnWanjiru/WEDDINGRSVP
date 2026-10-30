// D29: the public page shows the wedding content to anyone; visitors RSVP there (a "self-RSVP"),
// a Yes is approved automatically (D24) and only then is there a gate pass; device stamps.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { activityLog, emailQueue, invitations, siteVisits, weddings } from "@/server/db/schema";
import { getAccess, requireApproved } from "@/server/services/access";
import { getInvitationPage, getPublicPage } from "@/server/services/invitation-page";
import { purgeGuestData } from "@/server/services/purge";
import { submitPublicRsvp } from "@/server/services/public-rsvp";
import { getSiteVisitStats, newDeviceKey, recordSiteVisit } from "@/server/services/site-visits";
import { adminCtx } from "../helpers/admin";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const NOW = new Date("2026-11-01T10:00:00+03:00");
const MIN = 60 * 1000;
let ip = 0;
let phone = 100;
const nextIp = () => `198.51.100.${++ip}`;
const nextPhone = () => `07000${String(++phone).padStart(5, "0")}`;

async function setup(opts: { autoApprove?: boolean } = {}) {
  const wedding = await createWedding(db, { autoApprove: opts.autoApprove ?? true });
  const ctx = (extra: { deviceKey?: string; now?: Date } = {}) => ({ weddingSlug: wedding.slug, clientId: nextIp(), now: NOW, ...extra });
  const yes = (values: Record<string, unknown> = {}) => ({
    attending: true,
    primary: { fullName: "Walk In Guest", dietary: "none" },
    extras: [],
    phone: nextPhone(),
    ...values,
  });
  return { wedding, ctx, yes };
}

describe("D29: the public page", () => {
  it("shows the full content (story, programme, venues, dress code) to anyone, but no gate pass", async () => {
    const { wedding } = await setup();
    const page = await getPublicPage(db, wedding.slug, { now: NOW });
    expect(page.content.programme.length).toBeGreaterThan(0);
    expect(page.content.venues.length).toBeGreaterThan(0);
    expect(page.rsvp).toMatchObject({ open: true, weddingEvents: ["ceremony"], seatAllowance: 0 });
    expect(JSON.stringify(page)).not.toMatch(/qrSvg|passVersion|inviteToken/);
  });

  it("a purged or unknown wedding has no public page", async () => {
    const { wedding } = await setup();
    await db.update(weddings).set({ purgedAt: NOW }).where(eq(weddings.id, wedding.id));
    await expect(getPublicPage(db, wedding.slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getPublicPage(db, "no-such-wedding")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("an invited guest who hasn't been approved also sees the content on their own link", async () => {
    const { wedding } = await setup();
    const { token } = await createInvitation(db, wedding.id, { status: "sent" });
    const page = await getInvitationPage(db, token, { now: NOW });
    if (page.level !== "invited") throw new Error("unreachable");
    expect(page.content.programme.length).toBeGreaterThan(0);
  });

  it("BR-1 still holds for the gate pass: only approved guests get one", async () => {
    const { wedding } = await setup();
    const { token } = await createInvitation(db, wedding.id, { status: "awaiting_approval" });
    await expect(requireApproved(db, token)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("D29: public RSVP", () => {
  it("a Yes creates a self-RSVP guest, approved at once (D24), with a personal link", async () => {
    const { wedding, ctx, yes } = await setup();
    const out = await submitPublicRsvp(db, yes({ primary: { fullName: "Neema Wanjiku", dietary: "vegetarian" }, phone: "0711 000 222", email: "neema@example.com" }), ctx());
    if (out.kind !== "created") throw new Error(`expected created, got ${out.kind}`);
    expect(out.result).toMatchObject({ status: "approved", partySize: 1 });

    const access = await getAccess(db, out.token);
    expect(access.level).toBe("approved");
    if (access.level === "public") throw new Error("unreachable");
    expect(access.invitation).toMatchObject({ fullName: "Neema Wanjiku", phone: "+254711000222", email: "neema@example.com", source: "public", weddingId: wedding.id });
    await expect(requireApproved(db, out.token)).resolves.toBeTruthy(); // the gate pass is theirs

    const actions = (await db.select().from(activityLog).where(eq(activityLog.invitationId, access.invitation.id))).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["public_rsvp", "rsvp_yes", "approve"]));
    const mail = await db.select().from(emailQueue).where(eq(emailQueue.invitationId, access.invitation.id));
    expect(mail.map((m) => m.template)).toEqual(["approval_pass"]);
  });

  it("with auto-approval off, a Yes waits for the planner and has no pass yet", async () => {
    const { ctx, yes } = await setup({ autoApprove: false });
    const out = await submitPublicRsvp(db, yes(), ctx());
    if (out.kind !== "created") throw new Error("unreachable");
    expect(out.result.status).toBe("awaiting_approval");
    await expect(requireApproved(db, out.token)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("BR-11: over the venue capacity, a Yes waits for the planner", async () => {
    const { wedding, ctx, yes } = await setup();
    await db.update(weddings).set({ venueCapacity: 1 }).where(eq(weddings.id, wedding.id));
    expect((await submitPublicRsvp(db, yes(), ctx())).kind).toBe("created");
    const second = await submitPublicRsvp(db, yes(), ctx());
    if (second.kind !== "created") throw new Error("unreachable");
    expect(second.result.status).toBe("awaiting_approval");
  });

  it("a No is recorded as a declined self-RSVP, with the name given", async () => {
    const { ctx } = await setup();
    const out = await submitPublicRsvp(db, { attending: false, fullName: "Cannot Come", phone: nextPhone() }, ctx());
    if (out.kind !== "created") throw new Error("unreachable");
    const access = await getAccess(db, out.token);
    if (access.level === "public") throw new Error("unreachable");
    expect(access.invitation).toMatchObject({ status: "declined", fullName: "Cannot Come", source: "public" });
  });

  it("the phone is required, and must be a real number (BR-20)", async () => {
    const { ctx, yes } = await setup();
    await expect(submitPublicRsvp(db, yes({ phone: "" }), ctx())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(submitPublicRsvp(db, yes({ phone: "12" }), ctx())).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("BR-5: extra guests are limited to the wedding's default allowance, and a refused answer leaves no guest", async () => {
    const { wedding, ctx, yes } = await setup();
    const extras = [{ fullName: "Plus One", isChild: false, dietary: "none" }];
    await expect(submitPublicRsvp(db, yes({ extras }), ctx())).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.select().from(invitations).where(eq(invitations.weddingId, wedding.id))).toHaveLength(0);

    await db.update(weddings).set({ defaultSeatAllowance: 1 }).where(eq(weddings.id, wedding.id));
    const out = await submitPublicRsvp(db, yes({ extras }), ctx());
    if (out.kind !== "created") throw new Error("unreachable");
    expect(out.result.partySize).toBe(2);
  });

  it("BR-21: a phone already on the list gets nothing back; that guest's own link goes to their email", async () => {
    const { wedding, ctx, yes } = await setup();
    const { invitation } = await createInvitation(db, wedding.id, { status: "sent", phone: "+254722000333", email: "real@example.com" });
    expect(await submitPublicRsvp(db, yes({ phone: "0722 000 333" }), ctx())).toEqual({ kind: "existing" });
    expect(await submitPublicRsvp(db, yes({ phone: "0722 000 333" }), ctx())).toEqual({ kind: "existing" });

    const [inv] = await db.select().from(invitations).where(eq(invitations.id, invitation.id));
    expect(inv.status).toBe("sent"); // nothing changed for the real guest
    const mail = await db.select().from(emailQueue).where(eq(emailQueue.invitationId, invitation.id));
    expect(mail.map((m) => m.template)).toEqual(["invitation"]); // once a day at most
    expect(await db.select().from(invitations).where(eq(invitations.weddingId, wedding.id))).toHaveLength(1);
  });

  it("BR-7: closed after the RSVP deadline", async () => {
    const { ctx, yes } = await setup();
    await expect(submitPublicRsvp(db, yes(), ctx({ now: new Date("2026-11-20T10:00:00+03:00") }))).rejects.toMatchObject({ code: "DEADLINE_PASSED" });
  });

  it("E19: the honeypot looks like success and stores nothing", async () => {
    const { wedding, ctx, yes } = await setup();
    expect(await submitPublicRsvp(db, yes({ website: "http://spam.example" }), ctx())).toEqual({ kind: "ignored" });
    expect(await db.select().from(invitations).where(eq(invitations.weddingId, wedding.id))).toHaveLength(0);
  });

  it("is rate limited per connection", async () => {
    const { wedding, yes } = await setup();
    const same = { weddingSlug: wedding.slug, clientId: "192.0.2.77", now: NOW };
    for (let i = 0; i < 5; i++) await submitPublicRsvp(db, yes(), same);
    await expect(submitPublicRsvp(db, yes(), same)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("D29: device stamps", () => {
  it("counts devices and visits (30 minutes apart), and links the device that RSVPed", async () => {
    const { wedding, ctx, yes } = await setup();
    const phoneKey = newDeviceKey();
    const laptopKey = newDeviceKey();
    await recordSiteVisit(db, { weddingSlug: wedding.slug, deviceKey: phoneKey, device: "iPhone", now: NOW });
    await recordSiteVisit(db, { weddingSlug: wedding.slug, deviceKey: phoneKey, device: "iPhone", now: new Date(NOW.getTime() + 10 * MIN) }); // same visit
    await recordSiteVisit(db, { weddingSlug: wedding.slug, deviceKey: phoneKey, device: "iPhone", now: new Date(NOW.getTime() + 60 * MIN) }); // new visit
    await recordSiteVisit(db, { weddingSlug: wedding.slug, deviceKey: laptopKey, device: "Windows computer", now: NOW });

    const out = await submitPublicRsvp(db, yes({ primary: { fullName: "Phone Person", dietary: "none" } }), ctx({ deviceKey: phoneKey }));
    if (out.kind !== "created") throw new Error("unreachable");

    const stats = await getSiteVisitStats(db, await adminCtx(db, wedding.id));
    expect(stats).toMatchObject({ devices: 2, visits: 3, rsvped: 1 });
    expect(stats.recent[0]).toMatchObject({ device: "iPhone", visits: 2, fullName: "Phone Person" });

    const rows = await db.select().from(siteVisits).where(eq(siteVisits.weddingId, wedding.id));
    expect(JSON.stringify(rows)).not.toContain(phoneKey); // only a keyed hash is stored
  });

  it("ignores malformed device keys and unknown weddings", async () => {
    const { wedding } = await setup();
    await recordSiteVisit(db, { weddingSlug: wedding.slug, deviceKey: "not-a-key", device: "iPhone", now: NOW });
    await recordSiteVisit(db, { weddingSlug: "no-such-wedding", deviceKey: newDeviceKey(), device: "iPhone", now: NOW });
    expect(await db.select().from(siteVisits).where(eq(siteVisits.weddingId, wedding.id))).toHaveLength(0);
  });

  it("BR-23: the guest-data purge removes device stamps too", async () => {
    const { wedding } = await setup();
    await recordSiteVisit(db, { weddingSlug: wedding.slug, deviceKey: newDeviceKey(), device: "iPhone", now: NOW });
    await purgeGuestData(db, wedding.id, { actor: "system" }, NOW);
    expect(await db.select().from(siteVisits).where(eq(siteVisits.weddingId, wedding.id))).toHaveLength(0);
  });
});
