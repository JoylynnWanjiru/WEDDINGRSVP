// Wedding content and settings (U12, PROJECT_SPEC §8 Settings). Nothing couple-specific
// is hard-coded: the site reads all of this from here. Every write is scoped to
// ctx.weddingId, so another wedding's row id behaves as NOT_FOUND.

import { and, asc, eq, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "../../db/client";
import { adminSettings, contacts, dressCode, faqItems, photos, programmeItems, venues, weddings } from "../../db/schema";
import { normalizePhone } from "../../domain/phone";
import { AppError } from "../../errors";
import {
  contactInput,
  dressCodeInput,
  faqInput,
  parseInput,
  photoInput,
  programmeInput,
  venueInput,
  weddingPatch,
} from "../../validation/schemas";
import { logActivity } from "../activity";
import { adminLog, type AdminCtx } from "./context";

const logged = (db: Db, ctx: AdminCtx, section: string, op: string) =>
  logActivity(db, { ...adminLog(ctx), action: "content_updated", meta: { section, op } });

/**
 * D23: changing the wedding date moves the whole programme by the same number of days
 * (same times), so the order of the day never stays behind on the old date.
 */
export async function updateWeddingDetails(db: Db, ctx: AdminCtx, raw: unknown): Promise<{ programmeShiftedDays: number }> {
  const patch = parseInput(weddingPatch, raw);
  if (!Object.keys(patch).length) return { programmeShiftedDays: 0 };
  if (patch.gatesOpenAt && patch.ceremonyStartAt && patch.gatesOpenAt > patch.ceremonyStartAt) {
    throw new AppError("VALIDATION", "Gates should open before the ceremony starts.");
  }
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ weddingDate: weddings.weddingDate }).from(weddings).where(eq(weddings.id, ctx.weddingId)).for("update");
    const days = patch.weddingDate ? Math.round((Date.parse(patch.weddingDate) - Date.parse(current.weddingDate)) / 86_400_000) : 0;
    await tx.update(weddings).set(patch).where(eq(weddings.id, ctx.weddingId));
    if (days) {
      await tx
        .update(programmeItems)
        .set({ startsAt: sql`${programmeItems.startsAt} + make_interval(days => ${days})` })
        .where(eq(programmeItems.weddingId, ctx.weddingId));
    }
    await logActivity(tx, { ...adminLog(ctx), action: "content_updated", meta: { section: "wedding", op: "update", programmeShiftedDays: days || undefined } });
    return { programmeShiftedDays: days };
  });
}

/** Everything the settings page shows, in one call. */
export async function getSettings(db: Db, ctx: AdminCtx) {
  const w = ctx.weddingId;
  const [[wedding], venueRows, programme, faq, [dress], contactRows, photoRows, [admin]] = await Promise.all([
    db.select().from(weddings).where(eq(weddings.id, w)),
    db.select().from(venues).where(eq(venues.weddingId, w)).orderBy(asc(venues.sortOrder)),
    db.select().from(programmeItems).where(eq(programmeItems.weddingId, w)).orderBy(asc(programmeItems.startsAt), asc(programmeItems.sortOrder)),
    db.select().from(faqItems).where(eq(faqItems.weddingId, w)).orderBy(asc(faqItems.sortOrder)),
    db.select().from(dressCode).where(eq(dressCode.weddingId, w)),
    db.select().from(contacts).where(eq(contacts.weddingId, w)).orderBy(asc(contacts.sortOrder)),
    db.select().from(photos).where(eq(photos.weddingId, w)).orderBy(asc(photos.sortOrder)),
    db.select({ hasPin: sql<boolean>`${adminSettings.usherPinHash} is not null` }).from(adminSettings).where(eq(adminSettings.weddingId, w)),
  ]);
  if (!wedding) throw new AppError("NOT_FOUND", "Wedding not found.");
  return { wedding, venues: venueRows, programme, faq, dressCode: dress ?? null, contacts: contactRows, photos: photoRows, usherPinSet: !!admin?.hasPin };
}

type ScopedTable = PgTable & { id: PgColumn; weddingId: PgColumn };

/** Insert when there is no id; otherwise update that row of this wedding only. */
async function saveScoped<T extends { id?: string }>(
  db: Db,
  ctx: AdminCtx,
  table: ScopedTable,
  section: string,
  values: T,
): Promise<{ id: string }> {
  const { id, ...rest } = values;
  const row = { ...rest, weddingId: ctx.weddingId };
  if (!id) {
    const [created] = await db.insert(table).values(row).returning({ id: table.id });
    await logged(db, ctx, section, "create");
    return created as { id: string };
  }
  const updated = await db
    .update(table)
    .set(row)
    .where(and(eq(table.id, id), eq(table.weddingId, ctx.weddingId)))
    .returning({ id: table.id });
  if (!updated.length) throw new AppError("NOT_FOUND", "Item not found.");
  await logged(db, ctx, section, "update");
  return updated[0] as { id: string };
}

async function deleteScoped(db: Db, ctx: AdminCtx, table: ScopedTable, section: string, id: string) {
  const deleted = await db
    .delete(table)
    .where(and(eq(table.id, id), eq(table.weddingId, ctx.weddingId)))
    .returning({ id: table.id });
  if (!deleted.length) throw new AppError("NOT_FOUND", "Item not found.");
  await logged(db, ctx, section, "delete");
}

// Venues define the wedding's events (D9). Coordinates power the directions links (§6).
export const saveVenue = async (db: Db, ctx: AdminCtx, raw: unknown) => saveScoped(db, ctx, venues, "venues", parseInput(venueInput, raw));
export const deleteVenue = async (db: Db, ctx: AdminCtx, id: string) => deleteScoped(db, ctx, venues, "venues", id);

export async function saveProgrammeItem(db: Db, ctx: AdminCtx, raw: unknown) {
  const input = parseInput(programmeInput, raw);
  if (input.venueId) {
    const [v] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(and(eq(venues.id, input.venueId), eq(venues.weddingId, ctx.weddingId)));
    if (!v) throw new AppError("VALIDATION", "Please choose one of this wedding's venues.");
  }
  return saveScoped(db, ctx, programmeItems, "programme", input);
}
export const deleteProgrammeItem = async (db: Db, ctx: AdminCtx, id: string) => deleteScoped(db, ctx, programmeItems, "programme", id);

export const saveFaqItem = async (db: Db, ctx: AdminCtx, raw: unknown) => saveScoped(db, ctx, faqItems, "faq", parseInput(faqInput, raw));
export const deleteFaqItem = async (db: Db, ctx: AdminCtx, id: string) => deleteScoped(db, ctx, faqItems, "faq", id);

export async function saveContact(db: Db, ctx: AdminCtx, raw: unknown) {
  const input = parseInput(contactInput, raw);
  let phone: string | null | undefined = input.phone;
  if (phone) {
    phone = normalizePhone(phone); // BR-20: tap-to-call needs a clean number
    if (!phone) throw new AppError("VALIDATION", "Please enter a valid phone number.");
  }
  return saveScoped(db, ctx, contacts, "contacts", { ...input, phone });
}
export const deleteContact = async (db: Db, ctx: AdminCtx, id: string) => deleteScoped(db, ctx, contacts, "contacts", id);

export const savePhoto = async (db: Db, ctx: AdminCtx, raw: unknown) => saveScoped(db, ctx, photos, "photos", parseInput(photoInput, raw));
export const deletePhoto = async (db: Db, ctx: AdminCtx, id: string) => deleteScoped(db, ctx, photos, "photos", id);

export async function setDressCode(db: Db, ctx: AdminCtx, raw: unknown) {
  const input = parseInput(dressCodeInput, raw);
  await db
    .insert(dressCode)
    .values({ weddingId: ctx.weddingId, ...input })
    .onConflictDoUpdate({ target: dressCode.weddingId, set: input });
  await logged(db, ctx, "dress_code", "update");
}
