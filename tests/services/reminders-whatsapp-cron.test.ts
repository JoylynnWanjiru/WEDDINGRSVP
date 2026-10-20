// Module 5: reminders (BR-19, N1), WhatsApp sharing, cron jobs and cron auth.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { requireCron } from "@/server/auth/cron";
import type { Db } from "@/server/db/client";
import { emailQueue, invitations, weddings } from "@/server/db/schema";
import { runPostWedding, runReminders } from "@/server/services/cron";
import { queueReminders } from "@/server/services/reminders";
import { getWhatsappShare, markWhatsappShared } from "@/server/services/whatsapp";
import { daysAgo } from "@/server/utils/dates";
import { adminCtx } from "../helpers/admin";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";
import { FakeMailer } from "../helpers/mailer";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const NOW = new Date("2026-10-30T10:00:00+03:00");
let n = 0;

async function setup() {
  const wedding = await createWedding(db);
  const guest = (values: Parameters<typeof createInvitation>[2] = {}) =>
    createInvitation(db, wedding.id, { email: `r${++n}@example.com`, ...values });
  const queued = async (template: string) =>
    (await db.select().from(emailQueue).where(eq(emailQueue.weddingId, wedding.id))).filter((r) => r.template === template);
  return { wedding, guest, queued };
}

describe("BR-19: no-response reminders", () => {
  it("only for guests sent ≥3 days ago with no answer, not reminded in the last 3 days", async () => {
    const { wedding, guest, queued } = await setup();
    const due = await guest({ status: "sent", emailSentAt: daysAgo(NOW, 4) });
    const viaWhatsapp = await guest({ status: "viewed", whatsappSharedAt: daysAgo(NOW, 5) });
    const remindedLongAgo = await guest({ status: "sent", emailSentAt: daysAgo(NOW, 10), lastReminderAt: daysAgo(NOW, 4) });
    await guest({ status: "sent", emailSentAt: daysAgo(NOW, 1) }); // too recent
    await guest({ status: "sent", emailSentAt: daysAgo(NOW, 10), lastReminderAt: daysAgo(NOW, 1) }); // reminded recently
    await guest({ status: "awaiting_approval", emailSentAt: daysAgo(NOW, 10), respondedAt: daysAgo(NOW, 2) }); // answered
    await guest({ status: "sent", emailSentAt: daysAgo(NOW, 10), emailBouncedAt: NOW }); // bounced
    await guest({ status: "sent", emailSentAt: daysAgo(NOW, 10), email: null }); // no address
    await guest({ status: "draft" }); // never sent

    expect(await queueReminders(db, wedding, NOW)).toEqual({ noResponse: 3, dayBefore: 0 });
    expect((await queued("reminder_no_response")).map((r) => r.invitationId).sort()).toEqual(
      [due.invitation.id, viaWhatsapp.invitation.id, remindedLongAgo.invitation.id].sort(),
    );
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, due.invitation.id));
    expect(inv.lastReminderAt).toEqual(NOW);

    // Running again the same day queues nothing new.
    expect(await queueReminders(db, wedding, NOW)).toEqual({ noResponse: 0, dayBefore: 0 });
  });

  it("stops at the RSVP deadline", async () => {
    const { wedding, guest } = await setup();
    await guest({ status: "sent", emailSentAt: new Date("2026-11-01T10:00:00+03:00") });
    expect((await queueReminders(db, wedding, new Date("2026-11-15T09:00:00+03:00"))).noResponse).toBe(0);
  });

  it("a reminder for a guest who answers before it goes out is cancelled", async () => {
    const { wedding, guest } = await setup();
    const g = await guest({ status: "sent", emailSentAt: daysAgo(NOW, 4) });
    await queueReminders(db, wedding, NOW);
    await db.update(invitations).set({ respondedAt: NOW, status: "declined" }).where(eq(invitations.id, g.invitation.id));
    const mailer = new FakeMailer();
    const res = await runReminders(db, mailer, NOW);
    expect(res[wedding.slug].sent).toMatchObject({ sent: 0, cancelled: 1 });
  });
});

describe("day-before reminder", () => {
  it("goes to approved guests once, on 11 December (Nairobi), and only then", async () => {
    const { wedding, guest, queued } = await setup();
    await guest({ status: "approved" });
    await guest({ status: "partially_arrived" });
    await guest({ status: "awaiting_approval" });
    expect((await queueReminders(db, wedding, new Date("2026-12-10T20:00:00+03:00"))).dayBefore).toBe(0);
    const dayBefore = new Date("2026-12-11T08:00:00+03:00");
    expect((await queueReminders(db, wedding, dayBefore)).dayBefore).toBe(2);
    expect((await queueReminders(db, wedding, new Date("2026-12-11T20:00:00+03:00"))).dayBefore).toBe(0);
    expect(await queued("reminder_day_before")).toHaveLength(2);
  });

  it("the email has the pass, gate time and day-of link", async () => {
    const { guest } = await setup();
    const { invitation, token } = await guest({ status: "approved" });
    const mailer = new FakeMailer();
    await runReminders(db, mailer, new Date("2026-12-11T08:00:00+03:00")); // runs for every wedding in the database
    const [email] = mailer.to(invitation.email!);
    expect(email.subject).toMatch(/tomorrow/);
    expect(email.html).toContain(`https://wedding.test/i/${token}#pass`);
    expect(email.html).toContain(`https://wedding.test/i/${token}#programme`);
    expect(email.html).toMatch(/11:30\s?am EAT/i);
  });
});

describe("WhatsApp", () => {
  it("builds a wa.me link with the personal message and link", async () => {
    const { wedding, guest } = await setup();
    const ctx = await adminCtx(wedding.id);
    const { invitation, token } = await guest({ fullName: "Akinyi Otieno", phone: "+254700000951" });
    const { url, message } = await getWhatsappShare(db, ctx, invitation.id);
    expect(message).toContain("Hello Akinyi!");
    expect(message).toContain(`https://wedding.test/i/${token}`);
    expect(message).toContain("Saturday, 12 December 2026");
    expect(url).toBe(`https://wa.me/254700000951?text=${encodeURIComponent(message)}`);
  });

  it("needs a phone; refuses revoked guests", async () => {
    const { wedding, guest } = await setup();
    const ctx = await adminCtx(wedding.id);
    await expect(getWhatsappShare(db, ctx, (await guest()).invitation.id)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(getWhatsappShare(db, ctx, (await guest({ phone: "+254700000952", status: "revoked" })).invitation.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("marking it shared moves draft → sent and records the time", async () => {
    const { wedding, guest } = await setup();
    const ctx = await adminCtx(wedding.id);
    const { invitation } = await guest({ phone: "+254700000953" });
    expect(await markWhatsappShared(db, ctx, invitation.id, NOW)).toBe("sent");
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, invitation.id));
    expect(inv.whatsappSharedAt).toEqual(NOW);
  });
});

describe("cron", () => {
  it("BR-23: guest data is purged purgeAfterDays (30) after the wedding, not before", async () => {
    const { wedding, guest } = await setup();
    await guest({ status: "approved" });
    expect((await runPostWedding(db, new Date("2027-01-10T23:00:00+03:00"))).purged).not.toContain(wedding.slug);
    expect((await runPostWedding(db, new Date("2027-01-11T01:00:00+03:00"))).purged).toContain(wedding.slug);
    const [w] = await db.select().from(weddings).where(eq(weddings.id, wedding.id));
    expect(w.purgedAt).toBeInstanceOf(Date);
  });

  it("requireCron accepts only 'Bearer <CRON_SECRET>'", () => {
    expect(() => requireCron("Bearer test-cron-secret")).not.toThrow();
    for (const bad of [undefined, null, "", "test-cron-secret", "Bearer wrong", "bearer test-cron-secret"]) {
      expect(() => requireCron(bad)).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
    }
  });
});
