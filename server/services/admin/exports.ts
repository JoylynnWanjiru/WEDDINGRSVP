// CSV exports (N4, PROJECT_SPEC §8): guest list, caterer's dietary list,
// headcount by group, check-in report, vendor list with meals (D25). Cells are guarded against formula injection.

import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { checkIns, invitations, partyMembers, vendors } from "../../db/schema";
import { UNLOCKED_STATUSES } from "../../domain/status";
import { AppError } from "../../errors";
import { toCsv } from "../../utils/csv";
import { logActivity } from "../activity";
import { adminLog, type AdminCtx } from "./context";

export const EXPORT_KINDS = ["guests", "dietary", "headcount", "checkins", "vendors"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export async function exportCsv(db: Db, ctx: AdminCtx, kind: string): Promise<{ filename: string; csv: string }> {
  if (!EXPORT_KINDS.includes(kind as ExportKind)) throw new AppError("NOT_FOUND", "Unknown export.");
  const csv = await builders[kind as ExportKind](db, ctx.weddingId);
  // Exports contain personal data: record who downloaded what (§13 audit trail).
  await logActivity(db, { ...adminLog(ctx), action: "exported", meta: { kind } });
  return { filename: `${kind}.csv`, csv };
}

const builders: Record<ExportKind, (db: Db, weddingId: string) => Promise<string>> = {
  async guests(db, weddingId) {
    const rows = await db.select().from(invitations).where(eq(invitations.weddingId, weddingId)).orderBy(asc(invitations.fullName));
    return toCsv(rows, [
      { header: "Name", value: (r) => r.fullName },
      { header: "Phone", value: (r) => r.phone },
      { header: "Email", value: (r) => r.email },
      { header: "Group", value: (r) => r.group },
      { header: "Side", value: (r) => r.side },
      { header: "Status", value: (r) => r.status },
      { header: "Seat allowance", value: (r) => r.seatAllowance },
      { header: "Party size", value: (r) => r.partySize },
      { header: "Viewed at", value: (r) => r.firstViewedAt },
      { header: "Responded at", value: (r) => r.respondedAt },
      { header: "Arrived", value: (r) => r.arrivedCount },
    ]);
  },

  /** Approved guests only: the caterer cooks for people who are coming. */
  async dietary(db, weddingId) {
    const rows = await db
      .select({ invitation: invitations.fullName, member: partyMembers })
      .from(partyMembers)
      .innerJoin(invitations, eq(partyMembers.invitationId, invitations.id))
      .where(and(eq(invitations.weddingId, weddingId), inArray(invitations.status, [...UNLOCKED_STATUSES])))
      .orderBy(asc(invitations.fullName), asc(partyMembers.sortOrder));
    return toCsv(rows, [
      { header: "Guest", value: (r) => r.member.fullName },
      { header: "Party", value: (r) => r.invitation },
      { header: "Child", value: (r) => (r.member.isChild ? "yes" : "no") },
      { header: "Dietary", value: (r) => r.member.dietary },
      { header: "Notes", value: (r) => r.member.dietaryNotes },
    ]);
  },

  async headcount(db, weddingId) {
    const rows = await db
      .select({
        group: sql<string>`coalesce(${invitations.group}, '(none)')`,
        invitations: sql<number>`count(distinct ${invitations.id})::int`,
        approvedPeople: sql<number>`count(${partyMembers.id}) filter (where ${invitations.status} in ('approved', 'partially_arrived', 'arrived'))::int`,
        approvedChildren: sql<number>`count(${partyMembers.id}) filter (where ${partyMembers.isChild} and ${invitations.status} in ('approved', 'partially_arrived', 'arrived'))::int`,
      })
      .from(invitations)
      .leftJoin(partyMembers, eq(partyMembers.invitationId, invitations.id))
      .where(eq(invitations.weddingId, weddingId))
      .groupBy(sql`coalesce(${invitations.group}, '(none)')`)
      .orderBy(sql`coalesce(${invitations.group}, '(none)')`);
    return toCsv(rows, [
      { header: "Group", value: (r) => r.group },
      { header: "Invitations", value: (r) => r.invitations },
      { header: "Approved people", value: (r) => r.approvedPeople },
      { header: "Adults", value: (r) => r.approvedPeople - r.approvedChildren },
      { header: "Children", value: (r) => r.approvedChildren },
    ]);
  },

  async checkins(db, weddingId) {
    const rows = await db
      .select({
        name: invitations.fullName,
        partySize: invitations.partySize,
        arrived: invitations.arrivedCount,
        lastAt: max(checkIns.at),
      })
      .from(invitations)
      .leftJoin(checkIns, eq(checkIns.invitationId, invitations.id))
      .where(and(eq(invitations.weddingId, weddingId), inArray(invitations.status, [...UNLOCKED_STATUSES])))
      .groupBy(invitations.id)
      .orderBy(asc(invitations.fullName));
    return toCsv(rows, [
      { header: "Guest", value: (r) => r.name },
      { header: "Party size", value: (r) => r.partySize },
      { header: "Arrived", value: (r) => r.arrived },
      { header: "Last check-in", value: (r) => r.lastAt },
    ]);
  },

  /** D25: the vendor list, which is also the caterer's vendor meal count. Removed vendors are left out. */
  async vendors(db, weddingId) {
    const rows = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.weddingId, weddingId), isNull(vendors.removedAt)))
      .orderBy(asc(vendors.role), asc(vendors.company));
    return toCsv(rows, [
      { header: "Role", value: (r) => r.role },
      { header: "Company", value: (r) => r.company },
      { header: "Contact", value: (r) => r.contactName },
      { header: "Phone", value: (r) => r.phone },
      { header: "Email", value: (r) => r.email },
      { header: "Staff", value: (r) => r.staffCount },
      { header: "Meals", value: (r) => r.mealCount },
      { header: "Arrive at", value: (r) => r.arriveAt },
      { header: "Arrived", value: (r) => r.arrivedCount },
    ]);
  },
};
