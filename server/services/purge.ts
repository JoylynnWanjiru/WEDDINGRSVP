// Guest data deletion (BR-22, BR-23, Kenya Data Protection Act, D6).
// Admins must type a confirmation phrase; the post-wedding cron runs it as "system".
// Wedding content (programme, venues, FAQ, contacts) is kept; guest data is not.

import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { activityLog, emailQueue, invitationRequests, invitations, rateLimits, weddings } from "../db/schema";
import { AppError } from "../errors";
import { logActivity } from "./activity";
import type { AdminCtx } from "./admin/context";

export const PURGE_CONFIRMATION = "DELETE ALL GUEST DATA";

export type PurgeResult = { invitations: number; requests: number };

/** Admin button. The typed phrase guards against a mis-tap (D6: the planner shares this login). */
export async function purgeGuestDataAsAdmin(db: Db, ctx: AdminCtx, confirmation: string): Promise<PurgeResult> {
  if (confirmation.trim() !== PURGE_CONFIRMATION) {
    throw new AppError("VALIDATION", `Type "${PURGE_CONFIRMATION}" to confirm.`);
  }
  return purgeGuestData(db, ctx.weddingId, { actor: "admin", label: ctx.session.label });
}

/** Also called by the post-wedding cron (BR-23) with actor "system". */
export async function purgeGuestData(
  db: Db,
  weddingId: string,
  by: { actor: "admin" | "system"; label?: string },
  now: Date = new Date(),
): Promise<PurgeResult> {
  return db.transaction(async (tx) => {
    // Party members, RSVP events, check-ins, queued emails and per-guest log rows cascade.
    const removed = await tx.delete(invitations).where(eq(invitations.weddingId, weddingId)).returning({ id: invitations.id });
    const requests = await tx
      .delete(invitationRequests)
      .where(eq(invitationRequests.weddingId, weddingId))
      .returning({ id: invitationRequests.id });
    await tx.delete(emailQueue).where(eq(emailQueue.weddingId, weddingId));
    await tx.delete(activityLog).where(eq(activityLog.weddingId, weddingId)); // metas may reference requests
    await tx.delete(rateLimits).where(sql`true`); // keyed hashes of IPs; v1 serves one wedding
    await tx.update(weddings).set({ purgedAt: now }).where(eq(weddings.id, weddingId));

    const result = { invitations: removed.length, requests: requests.length };
    await logActivity(tx, { weddingId, actor: by.actor, actorLabel: by.label, action: "guest_data_purged", meta: result });
    return result;
  });
}
