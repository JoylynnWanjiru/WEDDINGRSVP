// Usher PIN login for the scanner (A6, E20, E26).

import { eq } from "drizzle-orm";
import { hitRateLimit, LIMITS, rateLimitKey } from "../auth/rate-limit";
import { loginUsher } from "../auth/sessions";
import type { Db } from "../db/client";
import { weddings } from "../db/schema";
import { AppError } from "../errors";
import { z } from "zod";
import { parseInput } from "../validation/schemas";

const loginInput = z.object({
  pin: z.string().trim().regex(/^\d{4,8}$/, "Enter the 4–8 digit gate PIN."),
  device: z.string().trim().min(1, "Name this device, e.g. Gate 1.").max(40),
});

/** Returns an usher session token. 10 attempts per 15 minutes per client (E20). */
export async function usherLogin(db: Db, raw: unknown, ctx: { weddingSlug: string; clientId: string; now?: Date }): Promise<string> {
  const { limit, windowSeconds } = LIMITS.usherLogin;
  const rate = await hitRateLimit(db, rateLimitKey("usherLogin", ctx.clientId), limit, windowSeconds, ctx.now);
  if (!rate.allowed) throw new AppError("RATE_LIMITED", "Too many attempts. Please wait 15 minutes.");
  const input = parseInput(loginInput, raw);
  const [w] = await db.select({ id: weddings.id }).from(weddings).where(eq(weddings.slug, ctx.weddingSlug));
  const token = w ? await loginUsher(db, w.id, input.pin, input.device) : null;
  if (!token) throw new AppError("UNAUTHORIZED", "Wrong PIN.");
  return token;
}
