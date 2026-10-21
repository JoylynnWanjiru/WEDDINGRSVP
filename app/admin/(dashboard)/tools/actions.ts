"use server";

// Gate and data actions (D20, D13). Each re-checks the admin session itself; the
// services validate the PIN and the purge phrase.

import { refresh } from "next/cache";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { changeUsherPin, correctArrivals, signOutUshers } from "@/server/services/admin/gate";
import { purgeGuestDataAsAdmin, type PurgeResult } from "@/server/services/purge";
import { getAdmin } from "../../_lib/auth";

export type ToolResult<T = undefined> = { ok: true; data?: T } | { ok: false; message: string };

async function run<T>(fn: (ctx: Awaited<ReturnType<typeof getAdmin>>) => Promise<T>): Promise<ToolResult<T>> {
  const ctx = await getAdmin();
  try {
    const data = await fn(ctx);
    refresh();
    return { ok: true, data };
  } catch (err) {
    if (isAppError(err)) return { ok: false, message: err.message };
    console.error(err);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

/** E26: also signs out every scanner (D5). */
export async function changePinAction(pin: string) {
  return run((ctx) => changeUsherPin(getDb(), ctx, String(pin).trim()));
}

export async function signOutUshersAction() {
  return run((ctx) => signOutUshers(getDb(), ctx));
}

/** §7: fix a mis-tapped count at the gate; the reason is logged. */
export async function correctArrivalsAction(invitationId: string, arrived: number, reason: string) {
  return run(async (ctx) => {
    await correctArrivals(getDb(), ctx, invitationId, Number(arrived), String(reason));
  });
}

/** BR-22/BR-23, D13: needs the typed phrase. */
export async function purgeAction(confirmation: string): Promise<ToolResult<PurgeResult>> {
  return run((ctx) => purgeGuestDataAsAdmin(getDb(), ctx, String(confirmation)));
}
