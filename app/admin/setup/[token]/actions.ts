"use server";

// Authenticator setup (D26): the new admin types a code from their app to prove the QR
// code was scanned. Anyone can call this, so the service checks the link and the code.

import { headers } from "next/headers";
import { confirmAdminSetup } from "@/server/auth/admins";
import { hitRateLimit, LIMITS, rateLimitKey } from "@/server/auth/rate-limit";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";

export type SetupState = { done?: boolean; error?: string };

export async function confirmSetupAction(token: string, _prev: SetupState, formData: FormData): Promise<SetupState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const { limit, windowSeconds } = LIMITS.adminSetup;
  if (!(await hitRateLimit(getDb(), rateLimitKey("adminSetup", ip), limit, windowSeconds)).allowed) {
    return { error: "Too many attempts. Please wait 15 minutes and try again." };
  }
  try {
    await confirmAdminSetup(getDb(), token, String(formData.get("code") ?? ""));
    return { done: true };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    console.error(err);
    return { error: "Something went wrong. Please try again." };
  }
}
