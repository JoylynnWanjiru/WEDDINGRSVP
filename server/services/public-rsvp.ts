// D29: RSVP on the public page. Anyone with the site address can answer; the answer becomes an
// invitation (source "public", a "self-RSVP") and goes through the same RSVP rules as a personal
// link (applyRsvp: BR-5 to BR-9, D24 auto-approval, BR-11 capacity). The planner reviews
// self-RSVPs in the admin afterwards and can revoke any of them (the gate then refuses the pass).

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hitRateLimit, LIMITS, rateLimitKey } from "../auth/rate-limit";
import { hashToken, inviteTokenFor } from "../auth/tokens";
import type { Db } from "../db/client";
import { invitations } from "../db/schema";
import { normalizePhone } from "../domain/phone";
import { isRsvpOpen } from "../domain/rules";
import { AppError } from "../errors";
import { nairobiDate } from "../utils/dates";
import { parseInput, publicRsvpInput } from "../validation/schemas";
import { getPublicAccess } from "./access";
import { logActivity } from "./activity";
import { enqueueEmail } from "./messaging";
import { applyRsvp, type RsvpResult } from "./rsvp";
import { linkDeviceToInvitation } from "./site-visits";

export type PublicRsvpOutcome =
  /** A new self-RSVP: `token` is their personal link token, kept on the device by the caller. */
  | { kind: "created"; token: string; result: RsvpResult }
  /**
   * The phone already belongs to an invitation. The visitor gets nothing from it (someone could type
   * a real guest's number); the guest's own link is re-sent to the email on file, if any.
   */
  | { kind: "existing" }
  /** E19 honeypot: looks like success, stores nothing. */
  | { kind: "ignored" };

export async function submitPublicRsvp(
  db: Db,
  raw: unknown,
  ctx: { weddingSlug: string; clientId: string; deviceKey?: string | null; now?: Date },
): Promise<PublicRsvpOutcome> {
  const now = ctx.now ?? new Date();
  const { limit, windowSeconds } = LIMITS.publicRsvp;
  const rate = await hitRateLimit(db, rateLimitKey("publicRsvp", ctx.clientId), limit, windowSeconds, now);
  if (!rate.allowed) throw new AppError("RATE_LIMITED", "Too many responses from this connection. Please try again later.");

  const input = parseInput(publicRsvpInput, raw);
  if (input.website) return { kind: "ignored" };

  const { wedding } = await getPublicAccess(db, ctx.weddingSlug);
  if (!isRsvpOpen(wedding.rsvpDeadline, now)) {
    throw new AppError("DEADLINE_PASSED", "The RSVP deadline has passed. Please contact the couple."); // BR-7
  }

  const phone = normalizePhone(input.phone); // BR-20
  if (!phone) {
    throw new AppError("VALIDATION", "Please enter a valid phone number, e.g. 0712 345 678.", {
      fields: [{ path: "phone", message: "Please enter a valid phone number, e.g. 0712 345 678." }],
    });
  }

  const existing = await findByPhone(db, wedding.id, phone);
  if (existing) return existingGuest(db, existing, now);

  const id = randomUUID();
  try {
    const result = await db.transaction(async (tx) => {
      const fullName = input.attending ? input.primary.fullName : input.fullName;
      if (!fullName.trim()) {
        throw new AppError("VALIDATION", "Please enter your full name.", { fields: [{ path: "primary.fullName", message: "Please enter your full name." }] });
      }
      await tx.insert(invitations).values({
        id,
        weddingId: wedding.id,
        fullName: fullName.trim(),
        phone,
        email: input.email ?? null,
        source: "public",
        seatAllowance: wedding.defaultSeatAllowance, // A2: the same allowance a couple-added guest gets
        inviteTokenHash: hashToken(inviteTokenFor(id, 1)),
      });
      await logActivity(tx, { weddingId: wedding.id, actor: "public", invitationId: id, action: "public_rsvp" });
      // The same rules as a personal RSVP, in the same transaction: a refused answer leaves no guest behind.
      return applyRsvp(tx, id, input, { actor: "guest", now });
    });
    await linkDeviceToInvitation(db, wedding.id, ctx.deviceKey, id);
    return { kind: "created", token: inviteTokenFor(id, 1), result };
  } catch (err) {
    // Two answers with the same phone at once (E1): the second one meets the first one's invitation.
    if (isUniqueViolation(err)) {
      const again = await findByPhone(db, wedding.id, phone);
      if (again) return existingGuest(db, again, now);
    }
    throw err;
  }
}

async function findByPhone(db: Db, weddingId: string, phone: string) {
  const [row] = await db
    .select({ id: invitations.id, weddingId: invitations.weddingId, email: invitations.email, status: invitations.status })
    .from(invitations)
    .where(and(eq(invitations.weddingId, weddingId), eq(invitations.phone, phone)));
  return row ?? null;
}

async function existingGuest(db: Db, inv: { id: string; weddingId: string; email: string | null; status: string }, now: Date): Promise<PublicRsvpOutcome> {
  if (inv.email && inv.status !== "revoked") {
    // At most once a day per guest, so the form can't be used to flood someone's inbox.
    await enqueueEmail(db, { weddingId: inv.weddingId, invitationId: inv.id, template: "invitation", dedupeKey: `public_rsvp_resend:${inv.id}:${nairobiDate(now)}`, scheduledFor: now });
  }
  await logActivity(db, { weddingId: inv.weddingId, actor: "public", invitationId: inv.id, action: "public_rsvp_existing_phone" });
  return { kind: "existing" };
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}


/** D29: the device keeps the self-RSVP guest's personal link token, so the page can show their pass. */
export const GUEST_LINK_COOKIE = "guest_link";
