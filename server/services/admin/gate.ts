// The couple's gate controls (E26, BLUEPRINT §7 one-way actions).

import { setUsherPin, signOutAllUshers } from "../../auth/sessions";
import type { Db } from "../../db/client";
import { invitations } from "../../db/schema";
import { AppError } from "../../errors";
import { logActivity } from "../activity";
import { applyTransition, lockInvitation } from "../transitions";
import { adminActor, adminLog, type AdminCtx } from "./context";

/** Setting or changing the PIN signs out every scanner (D5, E26). The PIN itself is never logged. */
export async function changeUsherPin(db: Db, ctx: AdminCtx, pin: string): Promise<void> {
  await setUsherPin(db, ctx.weddingId, pin);
  await logActivity(db, { ...adminLog(ctx), action: "usher_pin_changed" });
}

/** E26: an usher's phone is lost: end every scanner session without changing the PIN. */
export async function signOutUshers(db: Db, ctx: AdminCtx): Promise<void> {
  await signOutAllUshers(db, ctx.weddingId);
  await logActivity(db, { ...adminLog(ctx), action: "ushers_signed_out" });
}

/**
 * §7: correct the number who arrived (e.g. an usher tapped 3 instead of 2).
 * The original check_ins rows stay as they were; the correction is logged with a reason.
 */
export async function correctArrivals(db: Db, ctx: AdminCtx, invitationId: string, arrivedCount: number, reason: string) {
  if (!reason.trim()) throw new AppError("VALIDATION", "Please give a reason for the correction.");
  return db.transaction(async (tx) => {
    const inv = await lockInvitation(tx, ctx.weddingId, invitationId);
    if (!Number.isInteger(arrivedCount) || arrivedCount < 0 || arrivedCount > inv.partySize) {
      throw new AppError("VALIDATION", `Arrived must be between 0 and ${inv.partySize}.`);
    }
    return applyTransition(tx, inv, { type: "correct_arrivals", arrivedAfter: arrivedCount, partySize: inv.partySize }, adminActor(ctx), {
      set: { arrivedCount } satisfies Partial<typeof invitations.$inferInsert>,
      meta: { arrivedFrom: inv.arrivedCount, arrivedTo: arrivedCount, reason: reason.trim().slice(0, 300) },
    });
  });
}
