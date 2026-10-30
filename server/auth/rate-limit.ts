// Fixed-window rate limits stored in Postgres (E19, E20). One atomic upsert per hit,
// so concurrent requests from different serverless instances count correctly.

import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { config } from "../config";
import type { Db } from "../db/client";
import { rateLimits } from "../db/schema";

/**
 * Builds a rate-limit key from a client identifier (usually the IP). The IP is
 * keyed-hashed so raw addresses are never stored (Kenya DPA, BLUEPRINT §5b).
 * Always build keys with this; never pass a raw IP to hitRateLimit().
 */
export function rateLimitKey(kind: keyof typeof LIMITS, clientId: string): string {
  const digest = createHmac("sha256", config.tokenSecret()).update(`ip:${clientId}`).digest("base64url").slice(0, 22);
  return `${kind}:${digest}`;
}

/** Same keyed hash, for storing alongside a record (e.g. invitation_requests.ip_hash). */
export function hashClientId(clientId: string): string {
  return createHmac("sha256", config.tokenSecret()).update(`ip:${clientId}`).digest("base64url");
}

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: Date };

export async function hitRateLimit(
  db: Db,
  key: string,
  limit: number,
  windowSeconds: number,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowStartCutoff = new Date(now.getTime() - windowSeconds * 1000);
  const expired = sql`${rateLimits.windowStart} <= ${windowStartCutoff}`;

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${expired} THEN ${now} ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning();

  return {
    allowed: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    resetAt: new Date(row.windowStart.getTime() + windowSeconds * 1000),
  };
}

/** Limits used by the HTTP adapters. */
export const LIMITS = {
  adminLogin: { limit: 5, windowSeconds: 15 * 60 },
  adminAccount: { limit: 10, windowSeconds: 15 * 60 }, // D26: per email, so many IPs can't guess one person's codes
  adminSetup: { limit: 10, windowSeconds: 15 * 60 },
  usherLogin: { limit: 10, windowSeconds: 15 * 60 },
  tokenLookup: { limit: 60, windowSeconds: 60 },
  publicRequest: { limit: 3, windowSeconds: 60 * 60 },
  publicRsvp: { limit: 5, windowSeconds: 60 * 60 }, // D29: per IP; a family sharing wifi still fits
} as const;
