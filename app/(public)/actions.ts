"use server";

// Public page actions. Server Actions can be called directly by anyone, so every check lives in
// the services: validation, honeypot, rate limit, hashed IP, the RSVP rules.
// - Request an invitation (U11, D3, D10): kept for weddings that turn requests on (D21).
// - Public RSVP (D29): anyone can answer; the device then keeps their personal link.
// - Device stamp (D29): a visit to the public page, per device.

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import type { RsvpActionResult } from "@/app/i/[token]/actions";
import { ADMIN_COOKIE, requireAdmin } from "@/server/auth/sessions";
import { looksLikeInviteToken } from "@/server/auth/tokens";
import { config } from "@/server/config";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { recordView } from "@/server/services/invitation-page";
import { GUEST_LINK_COOKIE, submitPublicRsvp } from "@/server/services/public-rsvp";
import { requestInvitation } from "@/server/services/requests";
import { DEVICE_COOKIE, looksLikeDeviceKey, newDeviceKey, recordSiteVisit } from "@/server/services/site-visits";
import { deviceFromUserAgent } from "@/server/utils/device";

export type RequestState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string; fields?: Record<string, string> };

const clientIdOf = (h: Headers) => h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

/** Long enough to outlast the wedding; the cookies hold no personal data. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const cookieOptions = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: COOKIE_MAX_AGE } as const;

const fieldsOf = (err: { details?: unknown }) =>
  Object.fromEntries(((err.details as { fields?: { path: string; message: string }[] } | undefined)?.fields ?? []).map((f) => [f.path, f.message]));

export async function requestInvitationAction(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const clientId = clientIdOf(await headers());
  const raw = Object.fromEntries(["fullName", "phone", "email", "message", "website"].map((k) => [k, String(formData.get(k) ?? "")]));

  try {
    await requestInvitation(getDb(), raw, { weddingSlug: config.weddingSlug(), clientId });
    return { status: "success" };
  } catch (err) {
    if (isAppError(err)) return { status: "error", message: err.message, fields: fieldsOf(err) };
    console.error(err);
    return { status: "error", message: "Something went wrong. Please try again in a moment." };
  }
}

/** D29: RSVP on the public page. On success the device remembers the guest's personal link. */
export async function publicRsvpAction(input: unknown): Promise<RsvpActionResult> {
  const h = await headers();
  const jar = await cookies();
  try {
    const out = await submitPublicRsvp(getDb(), input, { weddingSlug: config.weddingSlug(), clientId: clientIdOf(h), deviceKey: jar.get(DEVICE_COOKIE)?.value });
    if (out.kind === "existing") {
      return {
        ok: false,
        message:
          "This phone number is already on the guest list. Please open the personal link the couple sent you. If they have your email address, we've just sent the link there again.",
        fields: { phone: "Already on the guest list." },
      };
    }
    if (out.kind === "created") {
      jar.set(GUEST_LINK_COOKIE, out.token, cookieOptions);
      refresh(); // the RSVP section becomes their pass (or their status)
      return { ok: true, status: out.result.status, awaitingApproval: out.result.awaitingApproval };
    }
    return { ok: true, status: "received", awaitingApproval: false }; // honeypot: say nothing
  } catch (err) {
    if (isAppError(err)) return { ok: false, message: err.message, fields: fieldsOf(err) };
    console.error(err);
    return { ok: false, message: "Something went wrong. Please try again in a moment." };
  }
}

/** D29: "Not you?" on a shared phone. The guest's link still works; this device just forgets it. */
export async function forgetDeviceAction(): Promise<void> {
  (await cookies()).delete(GUEST_LINK_COOKIE);
  refresh();
}

/**
 * D29 device stamp, called when the visitor opens the envelope on the public page (like U3, not on
 * page load, so link previews don't count). E27: the couple's own visits are not counted.
 * A device that RSVPed here also logs an open of its guest's invitation (D28).
 */
export async function recordPublicVisitAction(): Promise<void> {
  const jar = await cookies();
  const db = getDb();
  if (await requireAdmin(db, jar.get(ADMIN_COOKIE)?.value).then(() => true, () => false)) return;

  let deviceKey = jar.get(DEVICE_COOKIE)?.value;
  if (!looksLikeDeviceKey(deviceKey)) {
    deviceKey = newDeviceKey();
    jar.set(DEVICE_COOKIE, deviceKey, cookieOptions);
  }
  const device = deviceFromUserAgent((await headers()).get("user-agent"));
  const token = jar.get(GUEST_LINK_COOKIE)?.value;
  try {
    await recordSiteVisit(db, { weddingSlug: config.weddingSlug(), deviceKey, device });
    if (looksLikeInviteToken(token)) await recordView(db, token, { viewer: "guest", device });
  } catch (err) {
    console.error(err); // never break the page over a visit count
  }
}
