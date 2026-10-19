// Dashboard totals (U10, PROJECT_SPEC §8 overview cards, E25). All figures come
// straight from the database, so "totals match the database" (§15) holds by construction.

import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { emailQueue, invitationRequests, invitations, partyMembers } from "../../db/schema";
import { capacityOverflow } from "../../domain/rules";
import { INVITATION_STATUSES, UNLOCKED_STATUSES, type InvitationStatus } from "../../domain/status";
import { DIETARY } from "../../validation/schemas";
import { loadWedding, type AdminCtx } from "./context";

export async function getDashboard(db: Db, ctx: AdminCtx) {
  const wedding = await loadWedding(db, ctx);
  const w = eq(invitations.weddingId, ctx.weddingId);
  const unlocked = inArray(invitations.status, [...UNLOCKED_STATUSES]);

  const [byStatusRows, [funnel], [people], dietaryRows, [requests], emailRows] = await Promise.all([
    db.select({ status: invitations.status, n: sql<number>`count(*)::int` }).from(invitations).where(w).groupBy(invitations.status),
    db
      .select({
        invited: sql<number>`count(*) filter (where ${invitations.status} <> 'revoked')::int`,
        sent: sql<number>`count(*) filter (where ${invitations.status} not in ('draft', 'revoked'))::int`,
        viewed: sql<number>`count(*) filter (where ${invitations.firstViewedAt} is not null and ${invitations.status} <> 'revoked')::int`,
        noResponse: sql<number>`count(*) filter (where ${invitations.respondedAt} is null and ${invitations.status} <> 'revoked')::int`,
        arrived: sql<number>`coalesce(sum(${invitations.arrivedCount}), 0)::int`,
      })
      .from(invitations)
      .where(w),
    db
      .select({
        total: sql<number>`count(*)::int`,
        children: sql<number>`count(*) filter (where ${partyMembers.isChild})::int`,
      })
      .from(partyMembers)
      .innerJoin(invitations, eq(partyMembers.invitationId, invitations.id))
      .where(and(w, unlocked)),
    db
      .select({ dietary: partyMembers.dietary, n: sql<number>`count(*)::int` })
      .from(partyMembers)
      .innerJoin(invitations, eq(partyMembers.invitationId, invitations.id))
      .where(and(w, unlocked))
      .groupBy(partyMembers.dietary),
    db
      .select({ pending: sql<number>`count(*) filter (where ${invitationRequests.status} = 'pending')::int` })
      .from(invitationRequests)
      .where(eq(invitationRequests.weddingId, ctx.weddingId)),
    db
      .select({ status: emailQueue.status, n: sql<number>`count(*)::int` })
      .from(emailQueue)
      .where(eq(emailQueue.weddingId, ctx.weddingId))
      .groupBy(emailQueue.status),
  ]);

  const byStatus = Object.fromEntries(INVITATION_STATUSES.map((s) => [s, 0])) as Record<InvitationStatus, number>;
  for (const r of byStatusRows) byStatus[r.status] = r.n;
  const count = (...s: InvitationStatus[]) => s.reduce((sum, k) => sum + byStatus[k], 0);

  const approvedHeadcount = people.total;
  const dietary = Object.fromEntries(DIETARY.map((d) => [d, 0])) as Record<(typeof DIETARY)[number], number>;
  for (const r of dietaryRows) dietary[r.dietary] = r.n;
  const email = Object.fromEntries(emailRows.map((r) => [r.status, r.n]));

  return {
    cards: {
      invited: funnel.invited,
      viewed: funnel.viewed,
      notYetViewed: funnel.sent - funnel.viewed,
      awaitingApproval: byStatus.awaiting_approval,
      approved: count(...UNLOCKED_STATUSES),
      declined: byStatus.declined,
      notApproved: byStatus.not_approved,
      noResponse: funnel.noResponse,
      requests: requests.pending,
      revoked: byStatus.revoked,
    },
    byStatus,
    headcount: {
      approved: approvedHeadcount,
      adults: approvedHeadcount - people.children, // E25
      children: people.children,
      capacity: wedding.venueCapacity,
      overCapacityBy: capacityOverflow(approvedHeadcount, 0, wedding.venueCapacity),
      arrived: funnel.arrived,
    },
    dietary,
    email: { queued: email.queued ?? 0, failed: email.failed ?? 0, sent: email.sent ?? 0 }, // E9, E10 banner
  };
}
