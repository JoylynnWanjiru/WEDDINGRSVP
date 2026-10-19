// Public "request an invitation" form (U11, BLUEPRINT §5b, D3, E19).
// A request is not an invitation: it has no link and unlocks nothing.

import { eq } from "drizzle-orm";
import { hashClientId, hitRateLimit, LIMITS, rateLimitKey } from "../auth/rate-limit";
import type { Db } from "../db/client";
import { invitationRequests, weddings } from "../db/schema";
import { normalizePhone } from "../domain/phone";
import { AppError } from "../errors";
import { parseInput, requestInput } from "../validation/schemas";
import { logActivity } from "./activity";

/**
 * Always answers the same way on success, whether or not the person is already
 * invited, so the form can't be used to discover who is on the guest list.
 */
export async function requestInvitation(
  db: Db,
  raw: unknown,
  ctx: { weddingSlug: string; clientId: string; now?: Date },
): Promise<{ ok: true }> {
  const { limit, windowSeconds } = LIMITS.publicRequest;
  const rate = await hitRateLimit(db, rateLimitKey("publicRequest", ctx.clientId), limit, windowSeconds, ctx.now);
  if (!rate.allowed) throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.");

  const input = parseInput(requestInput, raw);
  if (input.website) return { ok: true }; // E19 honeypot: pretend success, store nothing

  const [wedding] = await db.select().from(weddings).where(eq(weddings.slug, ctx.weddingSlug));
  if (!wedding || wedding.purgedAt) throw new AppError("NOT_FOUND", "Wedding not found.");
  if (!wedding.publicRequestsEnabled) throw new AppError("FORBIDDEN", "Invitation requests are closed."); // A11

  let phone: string | null = null;
  if (input.phone) {
    phone = normalizePhone(input.phone); // BR-20
    if (!phone) throw new AppError("VALIDATION", "Please enter a valid phone number, e.g. 0712 345 678.");
  }

  const [request] = await db
    .insert(invitationRequests)
    .values({
      weddingId: wedding.id,
      fullName: input.fullName,
      phone,
      email: input.email ?? null,
      message: input.message ?? null,
      ipHash: hashClientId(ctx.clientId), // never the raw IP
    })
    .returning({ id: invitationRequests.id });

  await logActivity(db, { weddingId: wedding.id, actor: "public", action: "request_submitted", meta: { requestId: request.id } });
  return { ok: true };
}
