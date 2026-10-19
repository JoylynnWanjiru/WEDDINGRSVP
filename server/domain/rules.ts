// Pure business rules from BLUEPRINT §6. No database access here, so each rule
// can be tested directly; services call these before writing.

import { AppError } from "../errors";

export type PartyMemberInput = {
  fullName: string;
  isChild: boolean;
  dietary: string;
  dietaryNotes?: string | null;
};

/** BR-5: party = primary guest + extras, extras ≤ seat allowance. */
export function assertPartyWithinAllowance(extrasCount: number, seatAllowance: number): void {
  if (extrasCount > seatAllowance) {
    throw new AppError(
      "VALIDATION",
      seatAllowance === 0
        ? "This invitation is for you only. Please contact the couple to add guests."
        : `This invitation allows up to ${seatAllowance} extra ${seatAllowance === 1 ? "guest" : "guests"}.`,
      { extrasCount, seatAllowance },
    );
  }
}

/** BR-7: responses are accepted until the deadline (inclusive). Admins bypass this. */
export function isRsvpOpen(deadline: Date, now: Date = new Date()): boolean {
  return now.getTime() <= deadline.getTime();
}

const normaliseName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * BR-8: re-approval is needed when the new party contains anyone who wasn't in
 * the approved party. Removing people or changing dietary details doesn't count.
 * Swapping one name for another does: that is a new person at the gate.
 */
export function partyNeedsReapproval(approved: { fullName: string }[], updated: { fullName: string }[]): boolean {
  const remaining = new Map<string, number>();
  for (const m of approved) {
    const key = normaliseName(m.fullName);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  for (const m of updated) {
    const key = normaliseName(m.fullName);
    const left = remaining.get(key) ?? 0;
    if (left === 0) return true;
    remaining.set(key, left - 1);
  }
  return false;
}

/** BR-11: over-capacity approval is a warning that needs a second confirmation, not a block. */
export function capacityOverflow(approvedHeadcount: number, adding: number, capacity: number | null): number {
  if (capacity == null) return 0;
  return Math.max(0, approvedHeadcount + adding - capacity);
}

/** BR-12: the seat allowance can't drop below the extras already named. */
export function assertAllowanceCoversParty(newAllowance: number, currentExtras: number): void {
  if (newAllowance < 0) throw new AppError("VALIDATION", "Seat allowance can't be negative.");
  if (newAllowance < currentExtras) {
    throw new AppError(
      "CONFLICT",
      `This party already has ${currentExtras} extra ${currentExtras === 1 ? "guest" : "guests"}. Remove people first.`,
      { newAllowance, currentExtras },
    );
  }
}
