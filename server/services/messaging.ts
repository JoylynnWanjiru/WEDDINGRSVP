// Email queue (BLUEPRINT D7, BR-17, E9, E10, E11). Every email goes through here.
//
// Sending happens in two steps so two senders (two "Send now" clicks, or the cron
// alongside one) can never send the same email or overshoot the daily cap:
//  1. claim: under a lock on the wedding row, count today's sends (Nairobi day),
//     then mark up to the remaining allowance as "sending" (SKIP LOCKED);
//  2. deliver each claimed email outside the lock, then record the outcome.

import { and, asc, count, eq, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { emailQueue, invitations, weddings } from "../db/schema";
import { UNLOCKED_STATUSES } from "../domain/status";
import { AppError } from "../errors";
import { MailerError, type Mailer } from "../integrations/mailer";
import { nairobiDayStart } from "../utils/dates";
import { logActivity } from "./activity";
import { adminActor, adminLog, type AdminCtx } from "./admin/context";
import { composeEmail, parsePixelToken } from "./compose";
import { applyTransition, lockInvitation, type ActorRef } from "./transitions";

export type EmailTemplate = (typeof emailQueue.$inferInsert)["template"];

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MIN = [5, 30]; // after attempt 1 and 2
const STALE_SENDING_MIN = 10;
const CLAIM_BATCH = 10;

export async function enqueueEmail(
  db: Db,
  email: { weddingId: string; invitationId: string; template: EmailTemplate; dedupeKey?: string; scheduledFor?: Date },
): Promise<boolean> {
  // A repeated dedupe key (e.g. a double-tapped RSVP) is silently ignored.
  const rows = await db.insert(emailQueue).values(email).onConflictDoNothing({ target: emailQueue.dedupeKey }).returning({ id: emailQueue.id });
  return rows.length > 0;
}

// --- quota (BR-17) ---

async function sentToday(db: Db, weddingId: string, now: Date): Promise<{ sent: number; sending: number }> {
  const [row] = await db
    .select({
      sent: sql<number>`count(*) filter (where ${emailQueue.status} = 'sent' and ${emailQueue.sentAt} >= ${nairobiDayStart(now)})::int`,
      sending: sql<number>`count(*) filter (where ${emailQueue.status} = 'sending')::int`,
    })
    .from(emailQueue)
    .where(eq(emailQueue.weddingId, weddingId));
  return row;
}

export async function getEmailQuota(db: Db, ctx: AdminCtx, now: Date = new Date()) {
  const [w] = await db.select({ cap: weddings.dailyEmailCap }).from(weddings).where(eq(weddings.id, ctx.weddingId));
  const today = await sentToday(db, ctx.weddingId, now);
  const [{ due }] = await db
    .select({ due: count() })
    .from(emailQueue)
    .where(and(eq(emailQueue.weddingId, ctx.weddingId), eq(emailQueue.status, "queued")));
  return { cap: w.cap, sentToday: today.sent, remainingToday: Math.max(0, w.cap - today.sent - today.sending), queued: due };
}

// --- processing ---

export type ProcessSummary = {
  sent: number;
  failed: number;
  cancelled: number;
  retrying: number;
  capReached: boolean;
  authFailed: boolean;
  remaining: number;
};

type Claimed = typeof emailQueue.$inferSelect;

async function claimBatch(db: Db, weddingId: string, now: Date, limit: number): Promise<{ rows: Claimed[]; capReached: boolean }> {
  return db.transaction(async (tx) => {
    const [w] = await tx.select().from(weddings).where(eq(weddings.id, weddingId)).for("update");
    if (!w || w.purgedAt) return { rows: [], capReached: false };

    // A send interrupted mid-way (crash, timeout) may or may not have gone out: don't resend blindly.
    await tx
      .update(emailQueue)
      .set({ status: "failed", lastError: "Interrupted while sending: it may or may not have been delivered. Check before retrying." })
      .where(and(eq(emailQueue.weddingId, weddingId), eq(emailQueue.status, "sending"), lt(emailQueue.updatedAt, new Date(now.getTime() - STALE_SENDING_MIN * 60_000))));

    const today = await sentToday(tx, weddingId, now);
    const allowance = w.dailyEmailCap - today.sent - today.sending;
    if (allowance <= 0) return { rows: [], capReached: true };

    const due = await tx
      .select({ id: emailQueue.id })
      .from(emailQueue)
      .where(and(eq(emailQueue.weddingId, weddingId), eq(emailQueue.status, "queued"), lte(emailQueue.scheduledFor, now)))
      .orderBy(asc(emailQueue.scheduledFor), asc(emailQueue.createdAt))
      .limit(Math.min(limit, allowance))
      .for("update", { skipLocked: true });
    if (!due.length) return { rows: [], capReached: false };

    const rows = await tx
      .update(emailQueue)
      .set({ status: "sending", attempts: sql`${emailQueue.attempts} + 1`, updatedAt: now })
      .where(inArray(emailQueue.id, due.map((d) => d.id)))
      .returning();
    return { rows, capReached: false };
  });
}

type Outcome = "sent" | "failed" | "cancelled" | "retrying" | "auth";

async function deliver(db: Db, row: Claimed, mailer: Mailer, now: Date, by: ActorRef): Promise<Outcome> {
  const [ctx] = await db
    .select({ inv: invitations, wedding: weddings })
    .from(invitations)
    .innerJoin(weddings, eq(invitations.weddingId, weddings.id))
    .where(eq(invitations.id, row.invitationId!));
  if (!ctx) {
    await db.update(emailQueue).set({ status: "cancelled", lastError: "Guest no longer exists." }).where(eq(emailQueue.id, row.id));
    return "cancelled";
  }

  const composed = await composeEmail(db, row, ctx.inv, ctx.wedding, now);
  if ("cancel" in composed) {
    await db.update(emailQueue).set({ status: "cancelled", lastError: composed.cancel }).where(eq(emailQueue.id, row.id));
    return "cancelled";
  }

  try {
    const { messageId } = await mailer.send(composed.send);
    await db.transaction(async (tx) => {
      // E10: "sent" only once Gmail accepted it.
      await tx.update(emailQueue).set({ status: "sent", sentAt: now, messageId, lastError: null }).where(eq(emailQueue.id, row.id));
      if (row.template === "invitation") {
        const inv = await lockInvitation(tx, ctx.inv.weddingId, ctx.inv.id);
        if (inv.status === "revoked") {
          // Revoked while the email was in flight: record the delivery fact, change nothing else.
          await tx.update(invitations).set({ emailSentAt: now }).where(eq(invitations.id, inv.id));
        } else {
          await applyTransition(tx, inv, { type: "send" }, by, { set: { emailSentAt: now }, meta: { channel: "email" } });
        }
      } else if (row.template === "approval_pass") {
        await tx.update(invitations).set({ passEmailedAt: now }).where(eq(invitations.id, ctx.inv.id)); // D2: a delivery fact
      }
    });
    return "sent";
  } catch (err) {
    const e = err instanceof MailerError ? err : new MailerError("transient", String(err));
    const retry = e.kind === "transient" && row.attempts < MAX_ATTEMPTS;
    await db
      .update(emailQueue)
      .set(
        retry
          ? { status: "queued", lastError: e.message, scheduledFor: new Date(now.getTime() + RETRY_DELAYS_MIN[row.attempts - 1] * 60_000) }
          : { status: "failed", lastError: e.message },
      )
      .where(eq(emailQueue.id, row.id));
    if (e.kind === "auth") return "auth";
    return retry ? "retrying" : "failed";
  }
}

/** Sends due emails for one wedding until the queue, the cap, maxEmails or the time budget runs out. */
export async function processEmailQueue(
  db: Db,
  weddingId: string,
  mailer: Mailer,
  opts: { by: ActorRef; now?: Date; maxEmails?: number; timeBudgetMs?: number },
): Promise<ProcessSummary> {
  const now = opts.now ?? new Date();
  const maxEmails = opts.maxEmails ?? 200;
  const deadline = Date.now() + (opts.timeBudgetMs ?? 45_000); // well inside the 60 s function limit (§14)
  const s: ProcessSummary = { sent: 0, failed: 0, cancelled: 0, retrying: 0, capReached: false, authFailed: false, remaining: 0 };
  let processed = 0;

  while (processed < maxEmails && Date.now() < deadline && !s.authFailed) {
    const { rows, capReached } = await claimBatch(db, weddingId, now, Math.min(CLAIM_BATCH, maxEmails - processed));
    s.capReached ||= capReached;
    if (!rows.length) break;

    for (const [i, row] of rows.entries()) {
      const outcome = await deliver(db, row, mailer, now, opts.by);
      processed++;
      if (outcome === "auth") {
        // E10: the login is broken, so every other send would fail too. Put the rest back untouched.
        s.failed++;
        s.authFailed = true;
        const rest = rows.slice(i + 1).map((r) => r.id);
        if (rest.length) {
          await db.update(emailQueue).set({ status: "queued", attempts: sql`${emailQueue.attempts} - 1` }).where(inArray(emailQueue.id, rest));
        }
        break;
      }
      s[outcome]++;
    }
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(emailQueue)
    .where(and(eq(emailQueue.weddingId, weddingId), eq(emailQueue.status, "queued"), lte(emailQueue.scheduledFor, now)));
  s.remaining = n;
  if (s.sent || s.failed) {
    await logActivity(db, { weddingId, actor: opts.by.actor, actorLabel: opts.by.label, action: "emails_processed", meta: { ...s } });
  }
  return s;
}

/** D7: the admin's "Send now". The page calls it again while `remaining > 0` and the cap isn't reached. */
export function sendNow(db: Db, ctx: AdminCtx, mailer: Mailer, opts: { now?: Date; timeBudgetMs?: number } = {}) {
  return processEmailQueue(db, ctx.weddingId, mailer, { by: adminActor(ctx), maxEmails: 100, ...opts });
}

/** After fixing a problem (e.g. a new Gmail app password, E10), put failed emails back in the queue. */
export async function retryFailedEmails(db: Db, ctx: AdminCtx, now: Date = new Date()): Promise<number> {
  const rows = await db
    .update(emailQueue)
    .set({ status: "queued", attempts: 0, scheduledFor: now })
    .where(and(eq(emailQueue.weddingId, ctx.weddingId), eq(emailQueue.status, "failed")))
    .returning({ id: emailQueue.id });
  await logActivity(db, { ...adminLog(ctx), action: "emails_retried", meta: { count: rows.length } });
  return rows.length;
}

// --- admin actions ---

/** Queue invitation emails. Skips guests without email, bounced, revoked, or already queued. */
export async function queueInvitationEmails(db: Db, ctx: AdminCtx, invitationIds: string[]) {
  if (!invitationIds.length) return { queued: 0, skipped: [] as { id: string; reason: string }[] };
  if (invitationIds.length > 1000) throw new AppError("VALIDATION", "Please send at most 1,000 at a time.");
  const rows = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.weddingId, ctx.weddingId), inArray(invitations.id, invitationIds)));
  const pending = await db
    .select({ invitationId: emailQueue.invitationId })
    .from(emailQueue)
    .where(and(eq(emailQueue.weddingId, ctx.weddingId), eq(emailQueue.template, "invitation"), inArray(emailQueue.status, ["queued", "sending"])));
  const alreadyQueued = new Set(pending.map((p) => p.invitationId));

  const skipped: { id: string; reason: string }[] = [];
  const found = new Set(rows.map((r) => r.id));
  for (const id of invitationIds) if (!found.has(id)) skipped.push({ id, reason: "Guest not found." });

  const toQueue = rows.filter((r) => {
    const reason = !r.email
      ? "No email address: share on WhatsApp instead."
      : r.emailBouncedAt
        ? "Email marked as bounced."
        : r.status === "revoked"
          ? "Invitation revoked."
          : alreadyQueued.has(r.id)
            ? "Already queued."
            : null;
    if (reason) skipped.push({ id: r.id, reason });
    return !reason;
  });

  if (toQueue.length) {
    await db.insert(emailQueue).values(toQueue.map((r) => ({ weddingId: ctx.weddingId, invitationId: r.id, template: "invitation" as const })));
    await logActivity(db, { ...adminLog(ctx), action: "invitations_queued", meta: { count: toQueue.length } });
  }
  return { queued: toQueue.length, skipped };
}

/** N5 / E8: tell every approved guest that details changed. */
export async function queueDetailsUpdated(db: Db, ctx: AdminCtx): Promise<number> {
  const rows = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.weddingId, ctx.weddingId),
        inArray(invitations.status, [...UNLOCKED_STATUSES]),
        isNotNull(invitations.email),
        isNull(invitations.emailBouncedAt),
      ),
    );
  const pending = await db
    .select({ invitationId: emailQueue.invitationId })
    .from(emailQueue)
    .where(and(eq(emailQueue.weddingId, ctx.weddingId), eq(emailQueue.template, "details_updated"), eq(emailQueue.status, "queued")));
  const skip = new Set(pending.map((p) => p.invitationId));
  const toQueue = rows.filter((r) => !skip.has(r.id)); // a double click doesn't queue twice
  if (toQueue.length) {
    await db.insert(emailQueue).values(toQueue.map((r) => ({ weddingId: ctx.weddingId, invitationId: r.id, template: "details_updated" as const })));
  }
  await logActivity(db, { ...adminLog(ctx), action: "details_update_queued", meta: { count: toQueue.length } });
  return toQueue.length;
}

/** E11: the couple saw a bounce in Gmail. Stops emails to this address until it changes. */
export async function markEmailBounced(db: Db, ctx: AdminCtx, invitationId: string, now: Date = new Date()) {
  await db.transaction(async (tx) => {
    const inv = await lockInvitation(tx, ctx.weddingId, invitationId);
    if (!inv.email) throw new AppError("VALIDATION", "This guest has no email address.");
    await tx.update(invitations).set({ emailBouncedAt: now }).where(eq(invitations.id, inv.id));
    await tx
      .update(emailQueue)
      .set({ status: "cancelled", lastError: "Address bounced." })
      .where(and(eq(emailQueue.invitationId, inv.id), eq(emailQueue.status, "queued")));
    await logActivity(tx, { ...adminLog(ctx), invitationId: inv.id, action: "email_bounced" });
  });
}

// --- open tracking (E12: a hint only, never a status change) ---

export async function recordEmailOpen(db: Db, pixelToken: string, now: Date = new Date()): Promise<void> {
  const queueId = parsePixelToken(pixelToken);
  if (!queueId) return;
  const [row] = await db.select({ invitationId: emailQueue.invitationId }).from(emailQueue).where(eq(emailQueue.id, queueId));
  if (!row?.invitationId) return;
  await db
    .update(invitations)
    .set({ emailOpenedAt: now })
    .where(and(eq(invitations.id, row.invitationId), isNull(invitations.emailOpenedAt)));
}
