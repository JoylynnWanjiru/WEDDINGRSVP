// Scheduled jobs (BLUEPRINT §4 System actor, D7). On the free Vercel plan each runs
// once a day; "Send now" in admin is the main way to send (D7). All jobs are
// idempotent: a missed or repeated run is picked up safely by the next one (§10).

import { isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { weddings, type Wedding } from "../db/schema";
import type { Mailer } from "../integrations/mailer";
import { addDays, nairobiDate } from "../utils/dates";
import { processEmailQueue, type ProcessSummary } from "./messaging";
import { purgeGuestData } from "./purge";
import { queueReminders } from "./reminders";

const SYSTEM = { actor: "system" as const, label: "cron" };

const activeWeddings = (db: Db): Promise<Wedding[]> => db.select().from(weddings).where(isNull(weddings.purgedAt));

export async function runSendQueue(db: Db, mailer: Mailer, now: Date = new Date()) {
  const results: Record<string, ProcessSummary> = {};
  for (const w of await activeWeddings(db)) results[w.slug] = await processEmailQueue(db, w.id, mailer, { by: SYSTEM, now });
  return results;
}

/** Queues today's reminders, then sends what the cap allows. */
export async function runReminders(db: Db, mailer: Mailer, now: Date = new Date()) {
  const results: Record<string, { queued: Awaited<ReturnType<typeof queueReminders>>; sent: ProcessSummary }> = {};
  for (const w of await activeWeddings(db)) {
    const queued = await queueReminders(db, w, now);
    results[w.slug] = { queued, sent: await processEmailQueue(db, w.id, mailer, { by: SYSTEM, now }) };
  }
  return results;
}

/** BR-23: delete guest data `purgeAfterDays` after the wedding (Nairobi date). */
export async function runPostWedding(db: Db, now: Date = new Date()) {
  const purged: string[] = [];
  for (const w of await activeWeddings(db)) {
    if (nairobiDate(now) >= addDays(w.weddingDate, w.purgeAfterDays)) {
      await purgeGuestData(db, w.id, SYSTEM, now);
      purged.push(w.slug);
    }
  }
  return { purged };
}
