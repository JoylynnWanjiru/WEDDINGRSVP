// Email queue (BLUEPRINT D7, BR-17). Every email goes through the queue.
// Module 3 only enqueues; sending, the daily cap and retries arrive in Module 5.

import type { Db } from "../db/client";
import { emailQueue } from "../db/schema";

export type EmailTemplate = (typeof emailQueue.$inferInsert)["template"];

export async function enqueueEmail(
  db: Db,
  email: { weddingId: string; invitationId: string; template: EmailTemplate; dedupeKey?: string },
): Promise<void> {
  // A repeated dedupe key (e.g. a double-tapped RSVP) is silently ignored.
  await db.insert(emailQueue).values(email).onConflictDoNothing({ target: emailQueue.dedupeKey });
}
