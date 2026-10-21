"use server";

// Vendor actions (D25). Each re-checks the admin session itself (a layout doesn't protect
// actions); the services validate input with Zod and scope everything to this wedding.

import { refresh } from "next/cache";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { addVendor, newVendorLink, removeVendor, restoreVendor, updateVendor } from "@/server/services/admin/vendors";
import { getAdmin } from "../../_lib/auth";

export type VendorResult<T = undefined> = { ok: true; data?: T } | { ok: false; message: string; fields?: Record<string, string> };

async function run<T>(fn: (ctx: Awaited<ReturnType<typeof getAdmin>>) => Promise<T>): Promise<VendorResult<T>> {
  const ctx = await getAdmin();
  try {
    const data = await fn(ctx);
    refresh();
    return { ok: true, data };
  } catch (err) {
    if (isAppError(err)) {
      const d = err.details as { fields?: { path: string; message: string }[] } | undefined;
      return { ok: false, message: err.message, fields: d?.fields ? Object.fromEntries(d.fields.map((f) => [f.path, f.message])) : undefined };
    }
    console.error(err);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

export async function addVendorAction(input: Record<string, unknown>) {
  return run((ctx) => addVendor(getDb(), ctx, input));
}

export async function updateVendorAction(id: string, patch: Record<string, unknown>, expectedUpdatedAt: string) {
  return run((ctx) => updateVendor(getDb(), ctx, id, patch, new Date(expectedUpdatedAt)));
}

export async function removeVendorAction(id: string) {
  return run((ctx) => removeVendor(getDb(), ctx, id));
}

export async function restoreVendorAction(id: string) {
  return run((ctx) => restoreVendor(getDb(), ctx, id));
}

export async function newVendorLinkAction(id: string) {
  return run((ctx) => newVendorLink(getDb(), ctx, id));
}
