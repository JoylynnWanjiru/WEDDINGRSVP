// Module 5: the email queue (D7, BR-17, BR-18, E9, E10, E11, E12).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { emailQueue, invitations, venues, weddings } from "@/server/db/schema";
import { approveInvitation, revokeInvitation, restoreInvitation } from "@/server/services/admin/approvals";
import { updateInvitation } from "@/server/services/admin/guests";
import { pixelTokenFor } from "@/server/services/compose";
import {
  enqueueEmail,
  getEmailQuota,
  markEmailBounced,
  processEmailQueue,
  queueDetailsUpdated,
  queueInvitationEmails,
  recordEmailOpen,
  retryFailedEmails,
  sendNow,
} from "@/server/services/messaging";
import { submitRsvp } from "@/server/services/rsvp";
import { adminCtx } from "../helpers/admin";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";
import { FakeMailer } from "../helpers/mailer";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const NOW = new Date("2026-10-20T10:00:00+03:00");
const SYSTEM = { actor: "system" as const };

let n = 0;
async function setup(cap?: number) {
  const wedding = await createWedding(db);
  if (cap !== undefined) await db.update(weddings).set({ dailyEmailCap: cap }).where(eq(weddings.id, wedding.id));
  const ctx = await adminCtx(wedding.id);
  const guest = (values: Parameters<typeof createInvitation>[2] = {}) =>
    createInvitation(db, wedding.id, { email: `guest${++n}@example.com`, ...values });
  const queue = () => db.select().from(emailQueue).where(eq(emailQueue.weddingId, wedding.id));
  const reload = async (id: string) => (await db.select().from(invitations).where(eq(invitations.id, id)))[0];
  return { wedding, ctx, guest, queue, reload };
}

describe("sending an invitation email", () => {
  it("sends it, records Gmail's id, stamps emailSentAt and moves draft → sent", async () => {
    const { ctx, guest, queue, reload } = await setup();
    const { invitation, token } = await guest({ fullName: "Wanjiru Kamau" });
    expect(await queueInvitationEmails(db, ctx, [invitation.id], NOW)).toEqual({ queued: 1, skipped: [] });

    const mailer = new FakeMailer();
    const s = await sendNow(db, ctx, mailer, { now: NOW });
    expect(s).toMatchObject({ sent: 1, failed: 0, remaining: 0, capReached: false });
    const [email] = mailer.sent;
    expect(email).toMatchObject({ to: invitation.email, fromName: "Bride & Groom", subject: "You're invited: Bride & Groom" });
    expect(email.html).toContain(`https://wedding.test/i/${token}`);
    expect(email.html).toContain("Dear Wanjiru");
    expect(email.text).toContain(`https://wedding.test/i/${token}`);

    const [row] = await queue();
    expect(row).toMatchObject({ status: "sent", messageId: "<1@fake.test>", sentAt: NOW, attempts: 1 });
    expect(email.html).toContain(`/api/track/open/${pixelTokenFor(row.id)}`);
    expect(await reload(invitation.id)).toMatchObject({ status: "sent", emailSentAt: NOW });
  });

  it("escapes guest-supplied names so they can't inject HTML", async () => {
    const { ctx, guest } = await setup();
    const { invitation } = await guest({ fullName: '<script>alert("x")</script> Kamau' });
    await queueInvitationEmails(db, ctx, [invitation.id], NOW);
    const mailer = new FakeMailer();
    await sendNow(db, ctx, mailer, { now: NOW });
    expect(mailer.sent[0].html).not.toContain("<script>");
    expect(mailer.sent[0].html).toContain("&lt;script&gt;");
  });

  it("skips guests without email, bounced, revoked or already queued, with reasons", async () => {
    const { ctx, guest } = await setup();
    const ok = await guest();
    const noEmail = await guest({ email: null });
    const bounced = await guest({ emailBouncedAt: NOW });
    const revoked = await guest({ status: "revoked" });
    const res = await queueInvitationEmails(db, ctx, [ok.invitation.id, noEmail.invitation.id, bounced.invitation.id, revoked.invitation.id], NOW);
    expect(res.queued).toBe(1);
    expect(res.skipped.map((s) => s.reason)).toEqual([
      "No email address: share on WhatsApp instead.",
      "Email marked as bounced.",
      "Invitation revoked.",
    ]);
    expect((await queueInvitationEmails(db, ctx, [ok.invitation.id], NOW)).skipped[0].reason).toBe("Already queued.");
  });
});

describe("BR-17: the daily cap (400 by default, Nairobi calendar day)", () => {
  it("stops at the cap and carries on the next Nairobi day", async () => {
    const { ctx, guest, queue } = await setup(3);
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await guest()).invitation.id);
    await queueInvitationEmails(db, ctx, ids, NOW);

    const mailer = new FakeMailer();
    expect(await sendNow(db, ctx, mailer, { now: NOW })).toMatchObject({ sent: 3, capReached: true, remaining: 2 });
    expect(await sendNow(db, ctx, mailer, { now: NOW })).toMatchObject({ sent: 0, capReached: true, remaining: 2 });
    expect(await getEmailQuota(db, ctx, NOW)).toMatchObject({ cap: 3, sentToday: 3, remainingToday: 0, queued: 2 });

    const tomorrow = new Date("2026-10-21T00:05:00+03:00"); // just after midnight in Nairobi
    expect(await sendNow(db, ctx, mailer, { now: tomorrow })).toMatchObject({ sent: 2, remaining: 0 });
    expect(mailer.sent).toHaveLength(5);
    expect((await queue()).every((r) => r.status === "sent")).toBe(true);
  });

  it("the day boundary is Nairobi midnight, not UTC midnight", async () => {
    const { wedding, ctx, guest } = await setup(1);
    const g = await guest();
    await db.insert(emailQueue).values({
      weddingId: wedding.id,
      invitationId: g.invitation.id,
      template: "invitation",
      status: "sent",
      sentAt: new Date("2026-10-20T23:30:00+03:00"), // 20:30 UTC, still 20 Oct in Nairobi
    });
    expect((await getEmailQuota(db, ctx, new Date("2026-10-20T23:50:00+03:00"))).remainingToday).toBe(0);
    expect((await getEmailQuota(db, ctx, new Date("2026-10-21T00:10:00+03:00"))).remainingToday).toBe(1); // 21:10 UTC on 20 Oct
  });

  it("two senders at once never send an email twice or overshoot the cap", async () => {
    const { ctx, guest } = await setup(4);
    const ids = [];
    for (let i = 0; i < 6; i++) ids.push((await guest()).invitation.id);
    await queueInvitationEmails(db, ctx, ids, NOW);
    const mailer = new FakeMailer();
    const [a, b] = await Promise.all([sendNow(db, ctx, mailer, { now: NOW }), processEmailQueue(db, ctx.weddingId, mailer, { by: SYSTEM, now: NOW })]);
    expect(a.sent + b.sent).toBe(4);
    expect(new Set(mailer.sent.map((e) => e.to)).size).toBe(4);
  });
});

describe("failures (E10)", () => {
  it("a transient failure is retried after 5 then 30 minutes, then marked failed", async () => {
    const { ctx, guest, queue } = await setup();
    const { invitation } = await guest();
    await queueInvitationEmails(db, ctx, [invitation.id], NOW);
    const mailer = new FakeMailer().fail("transient", "transient", "transient");

    expect(await sendNow(db, ctx, mailer, { now: NOW })).toMatchObject({ sent: 0, retrying: 1, remaining: 0 });
    let [row] = await queue();
    expect(row).toMatchObject({ status: "queued", attempts: 1, scheduledFor: new Date(NOW.getTime() + 5 * 60_000) });

    await sendNow(db, ctx, mailer, { now: new Date(NOW.getTime() + 5 * 60_000) });
    [row] = await queue();
    expect(row).toMatchObject({ status: "queued", attempts: 2, scheduledFor: new Date(NOW.getTime() + 35 * 60_000) });

    expect(await sendNow(db, ctx, mailer, { now: new Date(NOW.getTime() + 35 * 60_000) })).toMatchObject({ failed: 1 });
    [row] = await queue();
    expect(row).toMatchObject({ status: "failed", attempts: 3, lastError: "fake transient failure" });
    expect(mailer.sent).toHaveLength(0);
  });

  it("a permanent failure is not retried", async () => {
    const { ctx, guest, queue } = await setup();
    await queueInvitationEmails(db, ctx, [(await guest()).invitation.id], NOW);
    expect(await sendNow(db, ctx, new FakeMailer().fail("permanent"), { now: NOW })).toMatchObject({ failed: 1, retrying: 0 });
    expect((await queue())[0].status).toBe("failed");
  });

  it("a Gmail login failure stops the batch, leaves the rest queued, and nothing is marked sent", async () => {
    const { ctx, guest, queue, reload } = await setup();
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await guest()).invitation.id);
    await queueInvitationEmails(db, ctx, ids, NOW);
    const s = await sendNow(db, ctx, new FakeMailer().fail("auth"), { now: NOW });
    expect(s).toMatchObject({ sent: 0, failed: 1, authFailed: true, remaining: 2 });
    const rows = await queue();
    expect(rows.filter((r) => r.status === "failed")).toHaveLength(1);
    expect(rows.filter((r) => r.status === "queued").every((r) => r.attempts === 0)).toBe(true);
    for (const id of ids) expect((await reload(id)).status).toBe("draft");

    // After fixing the password: retry and everything goes out.
    expect(await retryFailedEmails(db, ctx, NOW)).toBe(1);
    expect(await sendNow(db, ctx, new FakeMailer(), { now: NOW })).toMatchObject({ sent: 3 });
  });

  it("a send interrupted mid-way is marked failed for review, never resent blindly", async () => {
    const { wedding, ctx, guest, queue } = await setup();
    const g = await guest();
    await db.insert(emailQueue).values({ weddingId: wedding.id, invitationId: g.invitation.id, template: "invitation", status: "sending", updatedAt: new Date(NOW.getTime() - 15 * 60_000) });
    const mailer = new FakeMailer();
    await sendNow(db, ctx, mailer, { now: NOW });
    expect(mailer.sent).toHaveLength(0);
    expect((await queue())[0]).toMatchObject({ status: "failed", lastError: expect.stringMatching(/may or may not/) });
  });
});

describe("BR-18: each email re-checks that it still applies at send time", () => {
  it("the approval email carries venue, directions and programme, and records pass_emailed_at", async () => {
    const { wedding, ctx, guest, reload } = await setup();
    await db.update(venues).set({ name: "Safari Gardens", address: "Karen Road", lat: -1.32, lng: 36.7 }).where(eq(venues.weddingId, wedding.id));
    const { invitation, token } = await guest({ status: "awaiting_approval" });
    await approveInvitation(db, ctx, invitation.id, { now: NOW });
    const mailer = new FakeMailer();
    await sendNow(db, ctx, mailer, { now: NOW });
    const [email] = mailer.sent;
    expect(email.subject).toMatch(/confirmed/);
    expect(email.html).toContain("Safari Gardens");
    expect(email.html).toContain("https://www.google.com/maps/dir/?api=1&amp;destination=-1.32,36.7");
    expect(email.html).toContain("Ceremony begins");
    expect(email.html).toContain(`https://wedding.test/i/${token}#pass`);
    expect((await reload(invitation.id)).passEmailedAt).toEqual(NOW);
  });

  it("the 'RSVP received' email contains no venue or programme", async () => {
    const { wedding, guest } = await setup();
    await db.update(venues).set({ name: "Safari Gardens", address: "Karen Road" }).where(eq(venues.weddingId, wedding.id));
    const { token } = await guest({ status: "sent" });
    await submitRsvp(db, token, { attending: true, primary: { fullName: "Main Guest" } }, { now: NOW });
    const mailer = new FakeMailer();
    await processEmailQueue(db, wedding.id, mailer, { by: SYSTEM, now: NOW });
    const [email] = mailer.sent;
    expect(email.html).toContain("with the couple for confirmation");
    for (const secret of ["Safari Gardens", "Karen Road", "Ceremony begins", "#pass", "/pass"]) expect(email.html + email.text).not.toContain(secret);
  });

  it("an approval email for a guest revoked before sending is cancelled", async () => {
    const { ctx, guest, queue } = await setup();
    const { invitation } = await guest({ status: "awaiting_approval" });
    await approveInvitation(db, ctx, invitation.id, { now: NOW });
    await revokeInvitation(db, ctx, invitation.id, { now: NOW });
    const mailer = new FakeMailer();
    expect(await sendNow(db, ctx, mailer, { now: NOW })).toMatchObject({ sent: 0, cancelled: 1 });
    expect((await queue())[0]).toMatchObject({ status: "cancelled", lastError: expect.stringMatching(/no longer approved/) });
  });

  it("an 'RSVP received' email for a guest revoked before sending is cancelled", async () => {
    const { ctx, guest, queue } = await setup();
    const { invitation, token } = await guest({ status: "sent" });
    await submitRsvp(db, token, { attending: true, primary: { fullName: "Main Guest" } }, { now: NOW });
    await revokeInvitation(db, ctx, invitation.id, { now: NOW });
    const mailer = new FakeMailer();
    expect(await sendNow(db, ctx, mailer, { now: NOW })).toMatchObject({ sent: 0, cancelled: 1 });
    expect((await queue())[0]).toMatchObject({ template: "rsvp_received", status: "cancelled", lastError: "Invitation revoked." });
  });

  it("a 'revoked' notice is cancelled if the guest was restored first", async () => {
    const { ctx, guest } = await setup();
    const { invitation } = await guest({ status: "approved" });
    await revokeInvitation(db, ctx, invitation.id, { notifyGuest: true, now: NOW });
    await restoreInvitation(db, ctx, invitation.id);
    expect(await sendNow(db, ctx, new FakeMailer(), { now: NOW })).toMatchObject({ cancelled: 1 });
  });

  it("re-approval after a party change sends only the newest approval email", async () => {
    const { ctx, guest } = await setup();
    const { invitation, token } = await guest({ status: "sent", seatAllowance: 1 });
    await submitRsvp(db, token, { attending: true, primary: { fullName: "Main" } }, { now: NOW });
    await approveInvitation(db, ctx, invitation.id, { now: NOW });
    await submitRsvp(db, token, { attending: true, primary: { fullName: "Main" }, extras: [{ fullName: "Plus One" }] }, { now: NOW });
    await approveInvitation(db, ctx, invitation.id, { now: NOW });
    const mailer = new FakeMailer();
    const s = await sendNow(db, ctx, mailer, { now: NOW });
    const subjects = mailer.sent.map((e) => e.subject);
    expect(subjects.filter((x) => /confirmed/.test(x))).toHaveLength(1);
    expect(mailer.sent.find((e) => /confirmed/.test(e.subject))?.html).toContain("party of 2");
    expect(s.cancelled).toBe(1);
  });
});

describe("E11: bounces", () => {
  it("marking bounced cancels queued email; a corrected address can receive again", async () => {
    const { ctx, guest, queue, reload } = await setup();
    const { invitation } = await guest();
    await queueInvitationEmails(db, ctx, [invitation.id], NOW);
    await markEmailBounced(db, ctx, invitation.id, NOW);
    expect((await queue())[0].status).toBe("cancelled");
    expect((await queueInvitationEmails(db, ctx, [invitation.id], NOW)).skipped[0].reason).toBe("Email marked as bounced.");

    const inv = await reload(invitation.id);
    await updateInvitation(db, ctx, invitation.id, { email: "fixed@example.com" }, inv.updatedAt);
    expect((await reload(invitation.id)).emailBouncedAt).toBeNull();
    expect((await queueInvitationEmails(db, ctx, [invitation.id], NOW)).queued).toBe(1);
  });
});

describe("N5: details updated", () => {
  it("queues one email per approved guest with an address, and a double click adds nothing", async () => {
    const { ctx, guest } = await setup();
    await guest({ status: "approved" });
    await guest({ status: "partially_arrived" });
    await guest({ status: "approved", email: null });
    await guest({ status: "awaiting_approval" });
    expect(await queueDetailsUpdated(db, ctx, NOW)).toBe(2);
    expect(await queueDetailsUpdated(db, ctx, NOW)).toBe(0);
  });
});

describe("E12: the open pixel", () => {
  it("records the first open only, never changes status, and ignores forged tokens", async () => {
    const { wedding, guest, reload } = await setup();
    const { invitation } = await guest({ status: "sent" });
    await enqueueEmail(db, { weddingId: wedding.id, invitationId: invitation.id, template: "invitation", scheduledFor: NOW });
    const [row] = await db.select().from(emailQueue).where(eq(emailQueue.invitationId, invitation.id));

    await recordEmailOpen(db, `${row.id}.forgedsignature000000000`, NOW);
    expect((await reload(invitation.id)).emailOpenedAt).toBeNull();

    await recordEmailOpen(db, pixelTokenFor(row.id), NOW);
    await recordEmailOpen(db, pixelTokenFor(row.id), new Date(NOW.getTime() + 60_000));
    expect(await reload(invitation.id)).toMatchObject({ emailOpenedAt: NOW, status: "sent" });
  });
});
