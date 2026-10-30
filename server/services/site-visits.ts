// D29: the "device stamp" on the public page. A random first-party cookie identifies a device;
// only its keyed hash is stored, with a coarse device label (D28). Visits less than 30 minutes
// apart count once. When the device RSVPs, its row points at that guest.

import { createHmac, randomBytes } from "node:crypto";
import { and, count, desc, eq, isNotNull, sql, sum } from "drizzle-orm";
import { config } from "../config";
import type { Db } from "../db/client";
import { invitations, siteVisits, weddings } from "../db/schema";
import type { AdminCtx } from "./admin/context";

/** Same visit gap as the per-guest open log (D28). */
const VISIT_GAP = "30 minutes";

export const DEVICE_COOKIE = "device_key";

export const newDeviceKey = () => randomBytes(18).toString("base64url");

export const looksLikeDeviceKey = (key: string | null | undefined): key is string => !!key && /^[A-Za-z0-9_-]{24}$/.test(key);

/** Keyed hash: a leaked table can't be matched back to the cookies on people's phones. */
const hashDeviceKey = (key: string) => createHmac("sha256", config.tokenSecret()).update(`device:${key}`).digest("base64url");

/** Records a visit to the public page. Unknown or purged weddings record nothing. */
export async function recordSiteVisit(
  db: Db,
  opts: { weddingSlug: string; deviceKey: string; device: string; now?: Date },
): Promise<void> {
  if (!looksLikeDeviceKey(opts.deviceKey)) return;
  const now = opts.now ?? new Date();
  const [wedding] = await db.select({ id: weddings.id, purgedAt: weddings.purgedAt }).from(weddings).where(eq(weddings.slug, opts.weddingSlug));
  if (!wedding || wedding.purgedAt) return;

  await db
    .insert(siteVisits)
    .values({ weddingId: wedding.id, deviceHash: hashDeviceKey(opts.deviceKey), device: opts.device, firstSeenAt: now, lastSeenAt: now })
    .onConflictDoUpdate({
      target: [siteVisits.weddingId, siteVisits.deviceHash],
      set: {
        device: opts.device,
        lastSeenAt: now,
        visits: sql`case when ${now}::timestamptz - ${siteVisits.lastSeenAt} >= interval '${sql.raw(VISIT_GAP)}' then ${siteVisits.visits} + 1 else ${siteVisits.visits} end`,
      },
    });
}

/** After a public RSVP: this device belongs to that guest. */
export async function linkDeviceToInvitation(db: Db, weddingId: string, deviceKey: string | null | undefined, invitationId: string): Promise<void> {
  if (!looksLikeDeviceKey(deviceKey)) return;
  await db
    .update(siteVisits)
    .set({ invitationId })
    .where(and(eq(siteVisits.weddingId, weddingId), eq(siteVisits.deviceHash, hashDeviceKey(deviceKey))));
}

/** For the admin dashboard: devices, visits, how many of them RSVPed, and the latest visitors. */
export async function getSiteVisitStats(db: Db, ctx: AdminCtx, limit = 8) {
  const where = eq(siteVisits.weddingId, ctx.weddingId);
  const [[totals], [self], recent] = await Promise.all([
    db
      .select({ devices: count(), visits: sum(siteVisits.visits).mapWith(Number), rsvped: count(siteVisits.invitationId) })
      .from(siteVisits)
      .where(where),
    db.select({ n: count() }).from(invitations).where(and(eq(invitations.weddingId, ctx.weddingId), eq(invitations.source, "public"))),
    db
      .select({
        device: siteVisits.device,
        firstSeenAt: siteVisits.firstSeenAt,
        lastSeenAt: siteVisits.lastSeenAt,
        visits: siteVisits.visits,
        invitationId: siteVisits.invitationId,
        fullName: invitations.fullName,
      })
      .from(siteVisits)
      .leftJoin(invitations, eq(siteVisits.invitationId, invitations.id))
      .where(where)
      .orderBy(desc(siteVisits.lastSeenAt))
      .limit(limit),
  ]);
  return { devices: totals?.devices ?? 0, visits: totals?.visits ?? 0, rsvped: totals?.rsvped ?? 0, selfRsvps: self?.n ?? 0, recent };
}

/** The devices a self-RSVP guest used, for their admin page. */
export async function devicesForInvitation(db: Db, ctx: AdminCtx, invitationId: string) {
  return db
    .select({ device: siteVisits.device, firstSeenAt: siteVisits.firstSeenAt, lastSeenAt: siteVisits.lastSeenAt, visits: siteVisits.visits })
    .from(siteVisits)
    .where(and(eq(siteVisits.weddingId, ctx.weddingId), eq(siteVisits.invitationId, invitationId), isNotNull(siteVisits.invitationId)))
    .orderBy(desc(siteVisits.lastSeenAt));
}
