// Automatic reminders (N1, BR-19, PROJECT_SPEC §10).
//  - No response: guests who were sent an invitation at least `reminderIntervalDays`
//    ago and haven't answered; at most once per interval; never after the deadline.
//  - Day before: every approved guest, once, on the day before the wedding (Nairobi date).

import { and, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { invitations, type Wedding } from "../db/schema";
import { UNLOCKED_STATUSES } from "../domain/status";
import { isRsvpOpen } from "../domain/rules";
import { addDays, daysAgo, nairobiDate } from "../utils/dates";
import { logActivity } from "./activity";
import { enqueueEmail } from "./messaging";

export async function queueReminders(db: Db, wedding: Wedding, now: Date = new Date()): Promise<{ noResponse: number; dayBefore: number }> {
  let noResponse = 0;
  let dayBefore = 0;
  const cutoff = daysAgo(now, wedding.reminderIntervalDays);
  const withEmail = and(eq(invitations.weddingId, wedding.id), isNotNull(invitations.email), isNull(invitations.emailBouncedAt));

  if (isRsvpOpen(wedding.rsvpDeadline, now)) {
    const due = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          withEmail,
          inArray(invitations.status, ["sent", "viewed"]),
          isNull(invitations.respondedAt),
          // sent long enough ago, on any channel (D28: a copied link counts as sent)
          or(lte(invitations.emailSentAt, cutoff), lte(invitations.whatsappSharedAt, cutoff), lte(invitations.linkCopiedAt, cutoff)),
          // BR-19: at most once per interval
          or(isNull(invitations.lastReminderAt), lte(invitations.lastReminderAt, cutoff)),
        ),
      );
    for (const { id } of due) {
      if (await enqueueEmail(db, { weddingId: wedding.id, invitationId: id, template: "reminder_no_response", dedupeKey: `reminder:${id}:${nairobiDate(now)}`, scheduledFor: now })) {
        noResponse++;
      }
      await db.update(invitations).set({ lastReminderAt: now }).where(eq(invitations.id, id));
    }
  }

  if (nairobiDate(now) === addDays(wedding.weddingDate, -1)) {
    const approved = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(and(withEmail, inArray(invitations.status, [...UNLOCKED_STATUSES])));
    for (const { id } of approved) {
      if (await enqueueEmail(db, { weddingId: wedding.id, invitationId: id, template: "reminder_day_before", dedupeKey: `day_before:${id}`, scheduledFor: now })) {
        dayBefore++;
      }
    }
  }

  if (noResponse || dayBefore) {
    await logActivity(db, { weddingId: wedding.id, actor: "system", action: "reminders_queued", meta: { noResponse, dayBefore } });
  }
  return { noResponse, dayBefore };
}
