// Status changes for admin and gate actions. Every status write anywhere goes
// through nextStatus() (the lifecycle) and is logged in the same transaction
// (BLUEPRINT §13). RSVP and view tracking call nextStatus() directly because
// they write party and timestamp fields in the same update.

import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { invitations, type Invitation } from "../db/schema";
import { nextStatus, type InvitationStatus, type StatusAction } from "../domain/status";
import { AppError } from "../errors";
import { logActivity, type Actor } from "./activity";

export type ActorRef = { actor: Actor; label?: string };

/** Locks one invitation of one wedding (FOR UPDATE). Another wedding's id is NOT_FOUND. */
export async function lockInvitation(tx: Db, weddingId: string, invitationId: string): Promise<Invitation> {
  const [inv] = await tx
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.weddingId, weddingId)))
    .for("update");
  if (!inv) throw new AppError("NOT_FOUND", "Guest not found.");
  return inv;
}

export async function applyTransition(
  tx: Db,
  inv: Invitation,
  action: StatusAction,
  by: ActorRef,
  opts: { set?: Partial<typeof invitations.$inferInsert>; meta?: Record<string, unknown> } = {},
): Promise<InvitationStatus> {
  const to = nextStatus(inv.status, action);
  await tx
    .update(invitations)
    .set({ ...opts.set, status: to })
    .where(eq(invitations.id, inv.id));
  await logActivity(tx, {
    weddingId: inv.weddingId,
    actor: by.actor,
    actorLabel: by.label,
    invitationId: inv.id,
    action: action.type,
    meta: { from: inv.status, to, ...opts.meta },
  });
  return to;
}
