// Approval queue and the couple's decisions (U6, BLUEPRINT §5a, BR-10, BR-11, E22).
// Only admins reach these functions: each one requires an AdminCtx (BR-10).

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { invitations } from "../../db/schema";
import { capacityOverflow } from "../../domain/rules";
import { UNLOCKED_STATUSES, type InvitationStatus } from "../../domain/status";
import { AppError } from "../../errors";
import { enqueueEmail } from "../messaging";
import { applyTransition, lockInvitation } from "../transitions";
import { adminActor, loadWedding, type AdminCtx } from "./context";

export async function approvedHeadcount(db: Db, weddingId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${invitations.partySize}), 0)::int` })
    .from(invitations)
    .where(and(eq(invitations.weddingId, weddingId), inArray(invitations.status, [...UNLOCKED_STATUSES])));
  return row.n;
}

/**
 * Approves an attendance. BR-11: if this would exceed venue capacity the call
 * fails with CONFLICT and `details.overflow`; repeat with confirmOverCapacity.
 * The pass exists from this moment (D2); the approval email is queued.
 */
export async function approveInvitation(
  db: Db,
  ctx: AdminCtx,
  invitationId: string,
  opts: { confirmOverCapacity?: boolean; now?: Date } = {},
): Promise<{ status: InvitationStatus; overflow: number }> {
  const wedding = await loadWedding(db, ctx);
  return db.transaction(async (tx) => {
    const inv = await lockInvitation(tx, ctx.weddingId, invitationId);
    if (inv.status !== "awaiting_approval") {
      throw new AppError("INVALID_TRANSITION", "Only guests who said Yes and are awaiting approval can be approved.");
    }
    const overflow = capacityOverflow(await approvedHeadcount(tx, ctx.weddingId), inv.partySize, wedding.venueCapacity);
    if (overflow > 0 && !opts.confirmOverCapacity) {
      throw new AppError(
        "CONFLICT",
        `Approving this party of ${inv.partySize} goes ${overflow} over the venue capacity of ${wedding.venueCapacity}.`,
        { overflow, needsConfirmation: true },
      );
    }
    const status = await applyTransition(tx, inv, { type: "approve" }, adminActor(ctx), {
      set: { approvedAt: opts.now ?? new Date() },
      meta: { partySize: inv.partySize, overCapacityBy: overflow || undefined },
    });
    if (inv.email) {
      await enqueueEmail(tx, {
        weddingId: inv.weddingId,
        invitationId: inv.id,
        template: "approval_pass",
        dedupeKey: `approval_pass:${inv.id}:${inv.passVersion}`,
      });
    }
    return { status, overflow };
  });
}

export async function declineAttendance(db: Db, ctx: AdminCtx, invitationId: string, opts: { reason?: string } = {}) {
  return db.transaction(async (tx) => {
    const inv = await lockInvitation(tx, ctx.weddingId, invitationId);
    return applyTransition(tx, inv, { type: "decline_attendance" }, adminActor(ctx), { meta: { reason: opts.reason } });
  });
}

/** NOT_APPROVED → AWAITING_APPROVAL, so the couple can reconsider. */
export async function reopenAttendance(db: Db, ctx: AdminCtx, invitationId: string) {
  return db.transaction(async (tx) => {
    const inv = await lockInvitation(tx, ctx.weddingId, invitationId);
    return applyTransition(tx, inv, { type: "reopen" }, adminActor(ctx));
  });
}

/**
 * Withdraws an invitation: link and pass stop working at once (BR-3, BR-13).
 * The pass version is bumped, so restoring later never revives old screenshots (E22).
 */
export async function revokeInvitation(
  db: Db,
  ctx: AdminCtx,
  invitationId: string,
  opts: { reason?: string; notifyGuest?: boolean; now?: Date } = {},
) {
  return db.transaction(async (tx) => {
    const inv = await lockInvitation(tx, ctx.weddingId, invitationId);
    const status = await applyTransition(tx, inv, { type: "revoke" }, adminActor(ctx), {
      set: { statusBeforeRevoke: inv.status, revokedAt: opts.now ?? new Date(), passVersion: inv.passVersion + 1 },
      meta: { reason: opts.reason },
    });
    if (opts.notifyGuest && inv.email) {
      await enqueueEmail(tx, { weddingId: inv.weddingId, invitationId: inv.id, template: "revoked" });
    }
    return status;
  });
}

/** E22: back to the state before revoking. The pass is the fresh version issued at revoke time. */
export async function restoreInvitation(db: Db, ctx: AdminCtx, invitationId: string) {
  return db.transaction(async (tx) => {
    const inv = await lockInvitation(tx, ctx.weddingId, invitationId);
    return applyTransition(tx, inv, { type: "restore", previous: inv.statusBeforeRevoke }, adminActor(ctx), {
      set: { statusBeforeRevoke: null, revokedAt: null },
    });
  });
}

/** The queue of "Yes" responses waiting for the couple, oldest first, with capacity context. */
export async function getApprovalQueue(db: Db, ctx: AdminCtx) {
  const wedding = await loadWedding(db, ctx);
  const rows = await db
    .select({
      id: invitations.id,
      fullName: invitations.fullName,
      group: invitations.group,
      side: invitations.side,
      partySize: invitations.partySize,
      seatAllowance: invitations.seatAllowance,
      respondedAt: invitations.respondedAt,
      responseMessage: invitations.responseMessage,
    })
    .from(invitations)
    .where(and(eq(invitations.weddingId, ctx.weddingId), eq(invitations.status, "awaiting_approval")))
    .orderBy(asc(invitations.respondedAt));
  return { capacity: wedding.venueCapacity, approvedHeadcount: await approvedHeadcount(db, ctx.weddingId), queue: rows };
}
