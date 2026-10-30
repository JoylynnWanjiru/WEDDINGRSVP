"use server";

// Server actions for the personal invitation. Anyone can call these directly, so
// every check (token, status, deadline, seat allowance) happens in the services.

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { ADMIN_COOKIE, requireAdmin } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { recordView } from "@/server/services/invitation-page";
import { submitRsvp } from "@/server/services/rsvp";
import { deviceFromUserAgent } from "@/server/utils/device";

export type RsvpActionResult =
  | { ok: true; status: string; awaitingApproval: boolean }
  | { ok: false; message: string; fields?: Record<string, string> };

export async function submitRsvpAction(token: string, input: unknown): Promise<RsvpActionResult> {
  try {
    const res = await submitRsvp(getDb(), token, input);
    refresh(); // re-render the page with the new status
    return { ok: true, status: res.status, awaitingApproval: res.awaitingApproval };
  } catch (err) {
    if (isAppError(err)) {
      const list = (err.details as { fields?: { path: string; message: string }[] } | undefined)?.fields ?? [];
      return { ok: false, message: err.message, fields: Object.fromEntries(list.map((f) => [f.path, f.message])) };
    }
    console.error(err);
    return { ok: false, message: "Something went wrong. Please try again in a moment." };
  }
}

/**
 * U3 "proof of receipt": called when the guest taps the seal, not on page load, because
 * WhatsApp and email apps open links themselves to build previews. E27: the couple's own
 * opens (signed in as admin) are not counted.
 */
export async function recordViewAction(token: string): Promise<void> {
  const session = (await cookies()).get(ADMIN_COOKIE)?.value;
  const device = deviceFromUserAgent((await headers()).get("user-agent")); // D28: a coarse label only
  const viewer = await requireAdmin(getDb(), session).then(
    () => "admin" as const,
    () => "guest" as const,
  );
  try {
    await recordView(getDb(), token, { viewer, device });
  } catch (err) {
    console.error(err); // never break the invitation over tracking
  }
}
