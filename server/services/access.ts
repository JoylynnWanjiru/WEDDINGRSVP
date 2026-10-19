// THE approval gate (BLUEPRINT BR-1 to BR-4, §13). Every page, action, route and
// email that returns locked content calls requireApproved() BEFORE fetching it.
// Access is computed from the database on every call; nothing is cached (BR-3).

import { eq } from "drizzle-orm";
import { hashToken, looksLikeInviteToken } from "../auth/tokens";
import type { Db } from "../db/client";
import { invitations, weddings, type Invitation, type Wedding } from "../db/schema";
import { isUnlocked } from "../domain/status";
import { AppError } from "../errors";

/** Access levels from PROJECT_SPEC §4a. */
export type AccessLevel = "public" | "invited" | "declined" | "not_approved" | "revoked" | "approved";

export type Access =
  | { level: "public" }
  | { level: Exclude<AccessLevel, "public">; invitation: Invitation; wedding: Wedding };

const PUBLIC: Access = { level: "public" };

export async function getAccess(db: Db, token: string | null | undefined): Promise<Access> {
  if (!looksLikeInviteToken(token)) return PUBLIC; // BR-4

  const [row] = await db
    .select({ invitation: invitations, wedding: weddings })
    .from(invitations)
    .innerJoin(weddings, eq(invitations.weddingId, weddings.id))
    .where(eq(invitations.inviteTokenHash, hashToken(token)));

  if (!row || row.wedding.purgedAt) return PUBLIC; // BR-4: unknown looks exactly like none

  const { invitation, wedding } = row;
  return { level: levelFor(invitation), invitation, wedding };
}

function levelFor(invitation: Invitation): Exclude<AccessLevel, "public"> {
  const s = invitation.status;
  if (isUnlocked(s)) return "approved";
  if (s === "revoked") return "revoked";
  if (s === "declined") return "declined";
  if (s === "not_approved") return "not_approved";
  return "invited";
}

declare const approved: unique symbol;

/**
 * Proof that the approval gate passed. Only this module can create one, and
 * functions returning locked content require it as a parameter, so calling
 * them without passing the gate is a compile error, not just a runtime one.
 */
export type ApprovedAccess = { readonly invitation: Invitation; readonly wedding: Wedding; readonly [approved]: true };

/** Narrows an access result already fetched in this request (avoids a second lookup). */
export function approvedFrom(access: Access): ApprovedAccess | null {
  return access.level === "approved"
    ? ({ invitation: access.invitation, wedding: access.wedding } as ApprovedAccess)
    : null;
}

/** Throws FORBIDDEN (403, §6) unless the token belongs to an approved invitation. */
export async function requireApproved(db: Db, token: string | null | undefined): Promise<ApprovedAccess> {
  const proof = approvedFrom(await getAccess(db, token));
  if (!proof) throw new AppError("FORBIDDEN", "This content is available once your attendance is confirmed.");
  return proof;
}
