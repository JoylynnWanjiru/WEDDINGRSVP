// Wedding content and settings (U12, PROJECT_SPEC §8 Settings). Nothing couple-specific
// is hard-coded: the site reads all of this from here. Every write is scoped to
// ctx.weddingId, so another wedding's row id behaves as NOT_FOUND.

import { and, eq } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "../../db/client";
import { contacts, dressCode, faqItems, photos, programmeItems, venues, weddings } from "../../db/schema";
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

export async function updateWeddingDetails(db: Db, ctx: AdminCtx, raw: unknown) {
  const patch = parseInput(weddingPatch, raw);
  if (!Object.keys(patch).length) return;
  if (patch.gatesOpenAt && patch.ceremonyStartAt && patch.gatesOpenAt > patch.ceremonyStartAt) {
    throw new AppError("VALIDATION", "Gates should open before the ceremony starts.");
  }
  await db.update(weddings).set(patch).where(eq(weddings.id, ctx.weddingId));
  await logged(db, ctx, "wedding", "update");
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
