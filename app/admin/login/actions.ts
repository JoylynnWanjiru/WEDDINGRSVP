"use server";

// Admin login / logout (spec §12): password checked against ADMIN_PASSWORD_HASH (scrypt),
// rate-limited per client (E20), session in a signed HTTP-only SameSite=Lax cookie.

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hitRateLimit, LIMITS, rateLimitKey } from "@/server/auth/rate-limit";
import { ADMIN_COOKIE, loginAdmin } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";

export type LoginState = { error?: string };

const SEVEN_DAYS = 7 * 24 * 60 * 60;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const { limit, windowSeconds } = LIMITS.adminLogin;
  const rate = await hitRateLimit(getDb(), rateLimitKey("adminLogin", ip), limit, windowSeconds);
  if (!rate.allowed) return { error: "Too many attempts. Please wait 15 minutes and try again." };

  const token = await loginAdmin(String(formData.get("password") ?? ""));
  if (!token) return { error: "That password isn't right." };

  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SEVEN_DAYS });
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}
