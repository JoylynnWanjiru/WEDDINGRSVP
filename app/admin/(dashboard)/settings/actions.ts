"use server";

// Settings actions (U12). Each re-checks the admin session; the services validate every
// field (Zod) and scope every write to this wedding.

import { refresh } from "next/cache";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import {
  deleteContact,
  deleteFaqItem,
  deletePhoto,
  deleteProgrammeItem,
  deleteVenue,
  saveContact,
  saveFaqItem,
  savePhoto,
  saveProgrammeItem,
  saveVenue,
  setDressCode,
  updateWeddingDetails,
} from "@/server/services/admin/settings";
import { coordsFromMapsLink, type Coords } from "@/server/utils/maps-link";
import { getAdmin } from "../../_lib/auth";

export type SettingsResult<T = undefined> = { ok: true; data?: T } | { ok: false; message: string; fields?: Record<string, string> };

async function run<T>(fn: (ctx: Awaited<ReturnType<typeof getAdmin>>) => Promise<T>): Promise<SettingsResult<T>> {
  const ctx = await getAdmin();
  try {
    const data = await fn(ctx);
    refresh();
    return { ok: true, data };
  } catch (err) {
    if (isAppError(err)) {
      const list = (err.details as { fields?: { path: string; message: string }[] } | undefined)?.fields ?? [];
      return { ok: false, message: err.message, fields: Object.fromEntries(list.map((f) => [f.path, f.message])) };
    }
    console.error(err);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

export async function saveWeddingAction(patch: Record<string, unknown>) {
  return run((ctx) => updateWeddingDetails(getDb(), ctx, patch));
}

export type ItemKind = "venue" | "programme" | "faq" | "contact" | "photo";

const SAVE = { venue: saveVenue, programme: saveProgrammeItem, faq: saveFaqItem, contact: saveContact, photo: savePhoto } as const;
const DELETE = { venue: deleteVenue, programme: deleteProgrammeItem, faq: deleteFaqItem, contact: deleteContact, photo: deletePhoto } as const;

export async function saveItemAction(kind: ItemKind, values: Record<string, unknown>) {
  if (!(kind in SAVE)) return { ok: false as const, message: "Unknown item." };
  return run((ctx) => SAVE[kind](getDb(), ctx, values));
}

export async function deleteItemAction(kind: ItemKind, id: string) {
  if (!(kind in DELETE)) return { ok: false as const, message: "Unknown item." };
  return run((ctx) => DELETE[kind](getDb(), ctx, id));
}

export async function saveDressCodeAction(values: { text: string; swatches: { name: string; hex: string }[] }) {
  return run((ctx) => setDressCode(getDb(), ctx, values));
}

/** Paste a Google Maps link (short or long) or "lat, lng" → coordinates for the venue form. */
export async function resolveMapsLinkAction(link: string): Promise<SettingsResult<Coords>> {
  await getAdmin();
  const coords = await coordsFromMapsLink(link).catch(() => null);
  return coords
    ? { ok: true, data: coords }
    : { ok: false, message: "Couldn't find a pin in that link. In Google Maps, press and hold the spot, then share that dropped pin's link." };
}
