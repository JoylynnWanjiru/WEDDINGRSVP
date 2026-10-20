// The guest list (U1, U3, BR-7, BR-12, BR-20, BR-21, E21, E27).

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import { hashToken, inviteLink, inviteTokenFor } from "../../auth/tokens";
import type { Db } from "../../db/client";
import { activityLog, invitations, partyMembers, rsvpEvents, type Invitation } from "../../db/schema";
import { normalizePhone } from "../../domain/phone";
import { assertAllowanceCoversParty } from "../../domain/rules";
import type { InvitationStatus } from "../../domain/status";
import { AppError } from "../../errors";
import { parseCsvRecords } from "../../utils/csv";
import { invitationInput, invitationPatch, parseInput, rsvpInput } from "../../validation/schemas";
import { logActivity } from "../activity";
import { getInvitationPage } from "../invitation-page";
import { applyRsvp } from "../rsvp";
import { buildWhatsappShare } from "../whatsapp";
import { lockInvitation } from "../transitions";
import { adminLog, loadWedding, type AdminCtx } from "./context";

function phoneOrThrow(input: string | null | undefined): string | null {
  if (!input) return null;
  const phone = normalizePhone(input); // BR-20
  if (!phone) throw new AppError("VALIDATION", "Please enter a valid phone number, e.g. 0712 345 678.");
  return phone;
}

/** BR-21: adding a duplicate points the couple to the existing guest instead. */
async function assertPhoneFree(db: Db, weddingId: string, phone: string, exceptId?: string) {
  const [other] = await db
    .select({ id: invitations.id, fullName: invitations.fullName })
    .from(invitations)
    .where(and(eq(invitations.weddingId, weddingId), eq(invitations.phone, phone), exceptId ? ne(invitations.id, exceptId) : undefined));
  if (other) {
    throw new AppError("CONFLICT", `${other.fullName} already has this phone number.`, { existingInvitationId: other.id });
  }
}

function newInvitationRow(weddingId: string, values: Omit<typeof invitations.$inferInsert, "id" | "weddingId" | "inviteTokenHash">) {
  const id = randomUUID();
  return { ...values, id, weddingId, inviteTokenHash: hashToken(inviteTokenFor(id, 1)) };
}

export async function addInvitation(db: Db, ctx: AdminCtx, raw: unknown): Promise<{ id: string }> {
  const input = parseInput(invitationInput, raw);
  const wedding = await loadWedding(db, ctx);
  const phone = phoneOrThrow(input.phone);
  return db.transaction(async (tx) => {
    if (phone) await assertPhoneFree(tx, ctx.weddingId, phone);
    const row = newInvitationRow(ctx.weddingId, {
      fullName: input.fullName,
      phone,
      email: input.email ?? null,
      group: input.group ?? null,
      side: input.side ?? null,
      seatAllowance: input.seatAllowance ?? wedding.defaultSeatAllowance, // A2
      notes: input.notes ?? null,
      source: "admin",
    });
    await tx.insert(invitations).values(row);
    await logActivity(tx, { ...adminLog(ctx), invitationId: row.id, action: "added" });
    return { id: row.id };
  });
}

export type ImportResult = {
  created: number;
  skipped: { row: number; fullName: string; reason: string }[];
  dryRun: boolean;
};

const IMPORT_HEADERS = ["full_name", "phone", "email", "group", "side", "seat_allowance"];

/**
 * CSV import (template: public/templates/guest-list-template.csv). Valid rows
 * are created; invalid or duplicate rows (in the file or already invited) are
 * skipped with a reason. Use dryRun to preview without saving anything.
 */
export async function importInvitations(
  db: Db,
  ctx: AdminCtx,
  csvText: string,
  opts: { dryRun?: boolean } = {},
): Promise<ImportResult> {
  const { headers, records } = parseCsvRecords(csvText);
  if (!headers.includes("full_name")) {
    throw new AppError("VALIDATION", `The first row must be the headers: ${IMPORT_HEADERS.join(", ")}.`);
  }
  if (records.length > 2000) throw new AppError("VALIDATION", "Please import at most 2,000 guests at a time.");
  const wedding = await loadWedding(db, ctx);

  return db.transaction(async (tx) => {
    const existing = await tx.select({ phone: invitations.phone }).from(invitations).where(eq(invitations.weddingId, ctx.weddingId));
    const taken = new Set(existing.map((e) => e.phone).filter(Boolean));
    const result: ImportResult = { created: 0, skipped: [], dryRun: !!opts.dryRun };
    const rows: ReturnType<typeof newInvitationRow>[] = [];

    records.forEach((rec, i) => {
      const rowNumber = i + 2; // 1-based, after the header row
      const skip = (reason: string) => result.skipped.push({ row: rowNumber, fullName: rec.full_name ?? "", reason });
      const parsed = invitationInput.safeParse({
        fullName: rec.full_name,
        phone: rec.phone,
        email: rec.email,
        group: rec.group,
        side: rec.side ? rec.side.toLowerCase() : undefined,
        seatAllowance: rec.seat_allowance === "" || rec.seat_allowance === undefined ? undefined : rec.seat_allowance,
      });
      if (!parsed.success) return skip(parsed.error.issues[0]?.message ?? "Invalid row.");
      let phone: string | null = null;
      if (parsed.data.phone) {
        phone = normalizePhone(parsed.data.phone);
        if (!phone) return skip("Invalid phone number.");
        if (taken.has(phone)) return skip("This phone number is already on the guest list."); // BR-21, E13
        taken.add(phone);
      }
      rows.push(
        newInvitationRow(ctx.weddingId, {
          fullName: parsed.data.fullName,
          phone,
          email: parsed.data.email ?? null,
          group: parsed.data.group ?? null,
          side: parsed.data.side ?? null,
          seatAllowance: parsed.data.seatAllowance ?? wedding.defaultSeatAllowance,
          source: "import",
        }),
      );
    });

    result.created = rows.length;
    if (opts.dryRun || !rows.length) return result;

    await tx.insert(invitations).values(rows);
    await logActivity(tx, {
      ...adminLog(ctx),
      action: "imported",
      meta: { created: rows.length, skipped: result.skipped.length },
    });
    return result;
  });
}

/**
 * Edits guest details. E21: pass the updatedAt you loaded; if someone else saved
 * in between, this fails with CONFLICT instead of silently overwriting.
 */
export async function updateInvitation(db: Db, ctx: AdminCtx, invitationId: string, raw: unknown, expectedUpdatedAt: Date) {
  const patch = parseInput(invitationPatch, raw);
  return db.transaction(async (tx) => {
    const inv = await lockInvitation(tx, ctx.weddingId, invitationId);
    if (inv.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new AppError("CONFLICT", "This guest was changed by someone else. Please reload and try again.");
    }
    const phone = patch.phone === undefined ? undefined : phoneOrThrow(patch.phone);
    if (phone) await assertPhoneFree(tx, ctx.weddingId, phone, inv.id);
    if (patch.seatAllowance !== undefined) assertAllowanceCoversParty(patch.seatAllowance, inv.partySize - 1); // BR-12

    const set = Object.fromEntries(
      Object.entries({ ...patch, phone }).filter(([, v]) => v !== undefined),
    ) as Partial<typeof invitations.$inferInsert>;
    // E11: a corrected address can receive email again.
    if (patch.email !== undefined && patch.email !== inv.email) set.emailBouncedAt = null;
    const [updated] = await tx.update(invitations).set(set).where(eq(invitations.id, inv.id)).returning();
    await logActivity(tx, {
      ...adminLog(ctx),
      invitationId: inv.id,
      action: "edited",
      meta: { fields: Object.keys(set) }, // field names only: no personal data in the log
    });
    return { updatedAt: updated.updatedAt };
  });
}

/** The guest's personal link, rebuilt on demand (D1). */
export async function getInviteLink(db: Db, ctx: AdminCtx, invitationId: string): Promise<string> {
  const [inv] = await db
    .select({ id: invitations.id, version: invitations.inviteTokenVersion })
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.weddingId, ctx.weddingId)));
  if (!inv) throw new AppError("NOT_FOUND", "Guest not found.");
  return inviteLink(inv.id, inv.version);
}

/** Issues a new personal link; the old one stops working immediately (D1). */
export async function rotateInviteLink(db: Db, ctx: AdminCtx, invitationId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const inv = await lockInvitation(tx, ctx.weddingId, invitationId);
    const version = inv.inviteTokenVersion + 1;
    await tx
      .update(invitations)
      .set({ inviteTokenVersion: version, inviteTokenHash: hashToken(inviteTokenFor(inv.id, version)) })
      .where(eq(invitations.id, inv.id));
    await logActivity(tx, { ...adminLog(ctx), invitationId: inv.id, action: "link_rotated" });
    return inviteLink(inv.id, version);
  });
}

export type GuestFilter = {
  status?: InvitationStatus | InvitationStatus[];
  group?: string;
  side?: "bride" | "groom" | "both";
  search?: string;
  notViewed?: boolean;
  noResponse?: boolean;
};

export async function listInvitations(db: Db, ctx: AdminCtx, filter: GuestFilter = {}) {
  const where: (SQL | undefined)[] = [eq(invitations.weddingId, ctx.weddingId)];
  const statuses = filter.status ? [filter.status].flat() : [];
  if (statuses.length) where.push(or(...statuses.map((s) => eq(invitations.status, s))));
  if (filter.group) where.push(eq(invitations.group, filter.group));
  if (filter.side) where.push(eq(invitations.side, filter.side));
  if (filter.search?.trim()) {
    const q = `%${filter.search.trim().replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    const phoneQ = normalizePhone(filter.search);
    where.push(or(ilike(invitations.fullName, q), ilike(invitations.email, q), phoneQ ? eq(invitations.phone, phoneQ) : ilike(invitations.phone, q)));
  }

  const [rows, wedding] = await Promise.all([
    db.select().from(invitations).where(and(...where)).orderBy(asc(invitations.fullName)),
    loadWedding(db, ctx),
  ]);
  return rows
    .filter((r) => !filter.notViewed || (!r.firstViewedAt && r.status !== "draft" && r.status !== "revoked"))
    .filter((r) => !filter.noResponse || (!r.respondedAt && r.status !== "revoked"))
    .map((r) => ({
      ...listRow(r),
      // Ready-to-use links for the Copy and WhatsApp buttons in the list (admin only).
      link: inviteLink(r.id, r.inviteTokenVersion),
      whatsappUrl: buildWhatsappShare(r, wedding)?.url ?? null,
    }));
}

/** The groups in use, for the list filter. */
export async function listGroups(db: Db, ctx: AdminCtx): Promise<string[]> {
  const rows = await db.selectDistinct({ group: invitations.group }).from(invitations).where(eq(invitations.weddingId, ctx.weddingId));
  return rows.map((r) => r.group).filter((g): g is string => !!g).sort((a, b) => a.localeCompare(b));
}

const listRow = (r: Invitation) => ({
  id: r.id,
  fullName: r.fullName,
  phone: r.phone,
  email: r.email,
  group: r.group,
  side: r.side,
  status: r.status,
  seatAllowance: r.seatAllowance,
  partySize: r.partySize,
  arrivedCount: r.arrivedCount,
  emailSentAt: r.emailSentAt,
  emailBouncedAt: r.emailBouncedAt,
  whatsappSharedAt: r.whatsappSharedAt,
  firstViewedAt: r.firstViewedAt,
  respondedAt: r.respondedAt,
  passEmailedAt: r.passEmailedAt,
  updatedAt: r.updatedAt,
});

/** One guest with party, events, link and timeline (U3: sent → opened → viewed → responded → arrived). */
export async function getInvitationDetail(db: Db, ctx: AdminCtx, invitationId: string) {
  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.weddingId, ctx.weddingId)));
  if (!inv) throw new AppError("NOT_FOUND", "Guest not found.");
  const [party, events, timeline, wedding] = await Promise.all([
    db.select().from(partyMembers).where(eq(partyMembers.invitationId, inv.id)).orderBy(asc(partyMembers.sortOrder)),
    db.select().from(rsvpEvents).where(eq(rsvpEvents.invitationId, inv.id)),
    db
      .select({ at: activityLog.at, actor: activityLog.actor, actorLabel: activityLog.actorLabel, action: activityLog.action, meta: activityLog.meta })
      .from(activityLog)
      .where(eq(activityLog.invitationId, inv.id))
      .orderBy(desc(activityLog.at)),
    loadWedding(db, ctx),
  ]);
  return {
    ...listRow(inv),
    notes: inv.notes,
    source: inv.source,
    responseMessage: inv.responseMessage,
    emailOpenedAt: inv.emailOpenedAt, // a hint only (E12)
    lastViewedAt: inv.lastViewedAt,
    viewCount: inv.viewCount,
    approvedAt: inv.approvedAt,
    revokedAt: inv.revokedAt,
    link: inviteLink(inv.id, inv.inviteTokenVersion),
    whatsapp: buildWhatsappShare(inv, wedding),
    party: party.map((m) => ({ fullName: m.fullName, isChild: m.isChild, dietary: m.dietary, dietaryNotes: m.dietaryNotes, isPrimary: m.isPrimary })),
    events: events.map((e) => ({ event: e.event, attending: e.attending })),
    timeline,
  };
}

/** E27: what this guest sees, without recording a view. */
export async function previewInvitation(db: Db, ctx: AdminCtx, invitationId: string) {
  const [inv] = await db
    .select({ id: invitations.id, version: invitations.inviteTokenVersion })
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.weddingId, ctx.weddingId)));
  if (!inv) throw new AppError("NOT_FOUND", "Guest not found.");
  return getInvitationPage(db, inviteTokenFor(inv.id, inv.version));
}


/** BR-7: the couple can record or change a response at any time, including after the deadline (E14). */
export async function recordRsvpForGuest(db: Db, ctx: AdminCtx, invitationId: string, raw: unknown, opts: { now?: Date } = {}) {
  const input = parseInput(rsvpInput, raw);
  const [inv] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.weddingId, ctx.weddingId)));
  if (!inv) throw new AppError("NOT_FOUND", "Guest not found.");
  return applyRsvp(db, inv.id, input, { actor: "admin", actorLabel: ctx.session.label, now: opts.now ?? new Date() });
}
