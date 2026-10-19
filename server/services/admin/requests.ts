// The couple's view of public invitation requests (BLUEPRINT §5b, D3, E13).

import { randomUUID } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { hashToken, inviteTokenFor } from "../../auth/tokens";
import type { Db } from "../../db/client";
import { invitationRequests, invitations, type InvitationRequest } from "../../db/schema";
import { assertAllowanceCoversParty } from "../../domain/rules";
import { nextRequestStatus, type RequestStatus } from "../../domain/status";
import { AppError } from "../../errors";
import { logActivity } from "../activity";
import { adminLog, loadWedding, type AdminCtx } from "./context";

/** Finds an invitation in the same wedding with the request's phone, or else its email (E13). */
async function existingInvitationFor(db: Db, weddingId: string, r: Pick<InvitationRequest, "phone" | "email">) {
  const matches = [r.phone ? eq(invitations.phone, r.phone) : undefined, r.email ? sql`lower(${invitations.email}) = lower(${r.email})` : undefined].filter(
    (m) => m !== undefined,
  );
  if (!matches.length) return null;
  const [row] = await db
    .select({ id: invitations.id, fullName: invitations.fullName })
    .from(invitations)
    .where(and(eq(invitations.weddingId, weddingId), or(...matches)));
  return row ?? null;
}

export async function listRequests(db: Db, ctx: AdminCtx, opts: { status?: RequestStatus } = {}) {
  const rows = await db
    .select()
    .from(invitationRequests)
    .where(and(eq(invitationRequests.weddingId, ctx.weddingId), opts.status ? eq(invitationRequests.status, opts.status) : undefined))
    .orderBy(desc(invitationRequests.createdAt));
  // E13: flag requests from people who are already invited.
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      fullName: r.fullName,
      phone: r.phone,
      email: r.email,
      message: r.message,
      status: r.status,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      invitationId: r.invitationId,
      alreadyInvited: r.status === "pending" ? await existingInvitationFor(db, ctx.weddingId, r) : null,
    })),
  );
}

async function lockRequest(tx: Db, ctx: AdminCtx, requestId: string) {
  const [r] = await tx
    .select()
    .from(invitationRequests)
    .where(and(eq(invitationRequests.id, requestId), eq(invitationRequests.weddingId, ctx.weddingId)))
    .for("update");
  if (!r) throw new AppError("NOT_FOUND", "Request not found.");
  return r;
}

/**
 * Accepts a request. Creates a DRAFT invitation with its own personal link,
 * or, if the person is already invited (E13), links the request to that guest
 * instead of creating a duplicate.
 */
export async function acceptRequest(
  db: Db,
  ctx: AdminCtx,
  requestId: string,
  opts: { seatAllowance?: number; now?: Date } = {},
): Promise<{ invitationId: string; created: boolean }> {
  const wedding = await loadWedding(db, ctx);
  const seatAllowance = opts.seatAllowance ?? wedding.defaultSeatAllowance;
  assertAllowanceCoversParty(seatAllowance, 0);

  return db.transaction(async (tx) => {
    const r = await lockRequest(tx, ctx, requestId);
    const status = nextRequestStatus(r.status, { type: "accept" });
    const existing = await existingInvitationFor(tx, ctx.weddingId, r);

    let invitationId: string;
    if (existing) {
      invitationId = existing.id;
    } else {
      invitationId = randomUUID();
      await tx.insert(invitations).values({
        id: invitationId,
        weddingId: ctx.weddingId,
        fullName: r.fullName,
        phone: r.phone,
        email: r.email,
        seatAllowance,
        source: "request",
        inviteTokenHash: hashToken(inviteTokenFor(invitationId, 1)),
      });
    }

    await tx
      .update(invitationRequests)
      .set({ status, invitationId, reviewedAt: opts.now ?? new Date() })
      .where(eq(invitationRequests.id, r.id));
    await logActivity(tx, {
      ...adminLog(ctx),
      invitationId,
      action: existing ? "request_linked_existing" : "request_accepted",
      meta: { requestId: r.id },
    });
    return { invitationId, created: !existing };
  });
}

export async function rejectRequest(db: Db, ctx: AdminCtx, requestId: string, opts: { note?: string; now?: Date } = {}) {
  return db.transaction(async (tx) => {
    const r = await lockRequest(tx, ctx, requestId);
    const status = nextRequestStatus(r.status, { type: "reject" });
    await tx
      .update(invitationRequests)
      .set({ status, reviewNote: opts.note ?? null, reviewedAt: opts.now ?? new Date() })
      .where(eq(invitationRequests.id, r.id));
    await logActivity(tx, { ...adminLog(ctx), action: "request_rejected", meta: { requestId: r.id } });
    return status;
  });
}

export async function reopenRequest(db: Db, ctx: AdminCtx, requestId: string) {
  return db.transaction(async (tx) => {
    const r = await lockRequest(tx, ctx, requestId);
    const status = nextRequestStatus(r.status, { type: "reopen" });
    await tx.update(invitationRequests).set({ status, reviewedAt: null }).where(eq(invitationRequests.id, r.id));
    await logActivity(tx, { ...adminLog(ctx), action: "request_reopened", meta: { requestId: r.id } });
    return status;
  });
}
