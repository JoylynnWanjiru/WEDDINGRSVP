// The vendor list (D25): photographer, caterer, decor, DJ… A separate list from guests,
// never counted in guest totals or capacity (BR-11). Each team gets a personal link and
// a gate pass; removing a team or issuing a new link stops the old pass (as D13, E22).

import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { hashToken, vendorLink, vendorTokenFor } from "../../auth/tokens";
import type { Db } from "../../db/client";
import { vendors, type Vendor, type Wedding } from "../../db/schema";
import { normalizePhone } from "../../domain/phone";
import { AppError } from "../../errors";
import { formatDate, formatDateTime } from "../../utils/dates";
import { whatsappUrl } from "../../utils/whatsapp";
import { parseInput, vendorInput, vendorPatch } from "../../validation/schemas";
import { logActivity } from "../activity";
import { adminLog, loadWedding, type AdminCtx } from "./context";

function phoneOrThrow(input: string | null | undefined): string | null {
  if (!input) return null;
  const phone = normalizePhone(input); // BR-20
  if (!phone) throw new AppError("VALIDATION", "Please enter a valid phone number, e.g. 0712 345 678.");
  return phone;
}

async function lockVendor(tx: Db, ctx: AdminCtx, vendorId: string): Promise<Vendor> {
  const [v] = await tx
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.weddingId, ctx.weddingId)))
    .for("update");
  if (!v) throw new AppError("NOT_FOUND", "Vendor not found.");
  return v;
}

const log = (ctx: AdminCtx, vendorId: string, action: string, meta?: Record<string, unknown>) => ({ ...adminLog(ctx), vendorId, action, meta });

export async function addVendor(db: Db, ctx: AdminCtx, raw: unknown): Promise<{ id: string }> {
  const input = parseInput(vendorInput, raw);
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(vendors).values({
      id,
      weddingId: ctx.weddingId,
      company: input.company,
      role: input.role,
      contactName: input.contactName ?? null,
      phone: phoneOrThrow(input.phone),
      email: input.email ?? null,
      staffCount: input.staffCount,
      mealCount: input.mealCount ?? input.staffCount, // most teams eat on the day
      arriveAt: input.arriveAt ?? null,
      instructions: input.instructions ?? null,
      notes: input.notes ?? null,
      linkTokenHash: hashToken(vendorTokenFor(id, 1)),
    });
    await logActivity(tx, log(ctx, id, "vendor_added"));
  });
  return { id };
}

/** E21: pass the updatedAt you loaded; a stale edit is refused instead of overwriting. */
export async function updateVendor(db: Db, ctx: AdminCtx, vendorId: string, raw: unknown, expectedUpdatedAt: Date) {
  const patch = parseInput(vendorPatch, raw);
  return db.transaction(async (tx) => {
    const v = await lockVendor(tx, ctx, vendorId);
    if (v.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new AppError("CONFLICT", "This vendor was changed by someone else. Please reload and try again.");
    }
    // As BR-12: the team can't shrink below the people already inside.
    if (patch.staffCount !== undefined && patch.staffCount < v.arrivedCount) {
      throw new AppError("VALIDATION", `${v.arrivedCount} of this team have already arrived, so the team can't be smaller than that.`);
    }
    const phone = patch.phone === undefined ? undefined : phoneOrThrow(patch.phone);
    const set = Object.fromEntries(Object.entries({ ...patch, phone }).filter(([, val]) => val !== undefined)) as Partial<typeof vendors.$inferInsert>;
    const [updated] = await tx.update(vendors).set(set).where(eq(vendors.id, v.id)).returning();
    await logActivity(tx, log(ctx, v.id, "vendor_edited", { fields: Object.keys(set) })); // field names only
    return { updatedAt: updated.updatedAt };
  });
}

/** Link and pass stop working at once. The pass version moves on, so restoring doesn't revive old screenshots (as D13). */
export async function removeVendor(db: Db, ctx: AdminCtx, vendorId: string, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const v = await lockVendor(tx, ctx, vendorId);
    if (v.removedAt) return;
    await tx.update(vendors).set({ removedAt: now, passVersion: v.passVersion + 1 }).where(eq(vendors.id, v.id));
    await logActivity(tx, log(ctx, v.id, "vendor_removed"));
  });
}

export async function restoreVendor(db: Db, ctx: AdminCtx, vendorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const v = await lockVendor(tx, ctx, vendorId);
    if (!v.removedAt) return;
    await tx.update(vendors).set({ removedAt: null }).where(eq(vendors.id, v.id));
    await logActivity(tx, log(ctx, v.id, "vendor_restored"));
  });
}

/** A lost phone or a forwarded link: the old link and the old pass both stop working. */
export async function newVendorLink(db: Db, ctx: AdminCtx, vendorId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const v = await lockVendor(tx, ctx, vendorId);
    if (v.removedAt) throw new AppError("CONFLICT", "This vendor is removed. Restore them first.");
    const version = v.linkVersion + 1;
    await tx
      .update(vendors)
      .set({ linkVersion: version, linkTokenHash: hashToken(vendorTokenFor(v.id, version)), passVersion: v.passVersion + 1 })
      .where(eq(vendors.id, v.id));
    await logActivity(tx, log(ctx, v.id, "vendor_link_rotated"));
    return vendorLink(v.id, version);
  });
}

export async function listVendors(db: Db, ctx: AdminCtx) {
  const [wedding, rows] = await Promise.all([
    loadWedding(db, ctx),
    db.select().from(vendors).where(eq(vendors.weddingId, ctx.weddingId)).orderBy(asc(vendors.role), asc(vendors.company)),
  ]);
  return rows.map((v) => ({
    id: v.id,
    company: v.company,
    role: v.role,
    contactName: v.contactName,
    phone: v.phone,
    email: v.email,
    staffCount: v.staffCount,
    mealCount: v.mealCount,
    arriveAt: v.arriveAt,
    instructions: v.instructions,
    notes: v.notes,
    arrivedCount: v.arrivedCount,
    removed: !!v.removedAt,
    link: v.removedAt ? null : vendorLink(v.id, v.linkVersion),
    whatsappUrl: buildVendorWhatsapp(v, wedding)?.url ?? null,
    updatedAt: v.updatedAt,
  }));
}

/** The wa.me link and message for one vendor, or null if they can't be sent one. */
export function buildVendorWhatsapp(v: Vendor, wedding: Wedding): { url: string; message: string } | null {
  if (!v.phone || v.removedAt) return null;
  const hello = v.contactName ? v.contactName.trim().split(/\s+/)[0] : v.company;
  const message =
    `Hello ${hello}! Here is your page for ${wedding.brideName} & ${wedding.groomName}'s wedding on ${formatDate(wedding.weddingDate)}` +
    (v.arriveAt ? ` (please arrive by ${formatDateTime(v.arriveAt)})` : "") +
    `.\nIt has the programme, directions, contacts and your team's gate pass: ${vendorLink(v.id, v.linkVersion)}`;
  return { url: whatsappUrl(v.phone, message), message };
}

/** "Send on WhatsApp": the couple's phone opens WhatsApp with the vendor's link filled in. */
export async function getVendorWhatsapp(db: Db, ctx: AdminCtx, vendorId: string): Promise<{ url: string; message: string }> {
  const [v] = await db.select().from(vendors).where(and(eq(vendors.id, vendorId), eq(vendors.weddingId, ctx.weddingId)));
  if (!v) throw new AppError("NOT_FOUND", "Vendor not found.");
  if (!v.phone) throw new AppError("VALIDATION", "This vendor has no phone number.");
  if (v.removedAt) throw new AppError("CONFLICT", "This vendor is removed.");
  return buildVendorWhatsapp(v, await loadWedding(db, ctx))!;
}
