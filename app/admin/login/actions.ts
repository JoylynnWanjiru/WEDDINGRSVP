"use server";

// Admin login / logout (spec §12, D26): email, the shared password (ADMIN_PASSWORD_HASH,
// scrypt) and a code from that person's authenticator app. Rate-limited per client and per
// email (E20); session in a signed HTTP-only SameSite=Lax cookie.

import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hitRateLimit, LIMITS, rateLimitKey } from "@/server/auth/rate-limit";
import { ADMIN_COOKIE, loginAdmin } from "@/server/auth/sessions";
import { config } from "@/server/config";
import { getDb } from "@/server/db/client";
import { weddings } from "@/server/db/schema";

export type LoginState = { error?: string };

const SEVEN_DAYS = 7 * 24 * 60 * 60;
const TOO_MANY = "Too many attempts. Please wait 15 minutes and try again.";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const db = getDb();

  const { limit, windowSeconds } = LIMITS.adminLogin;
  if (!(await hitRateLimit(db, rateLimitKey("adminLogin", ip), limit, windowSeconds)).allowed) return { error: TOO_MANY };
  const account = LIMITS.adminAccount;
  if (!(await hitRateLimit(db, rateLimitKey("adminAccount", email), account.limit, account.windowSeconds)).allowed) return { error: TOO_MANY };

  const [w] = await db.select({ id: weddings.id }).from(weddings).where(eq(weddings.slug, config.weddingSlug()));
  const token = w
    ? await loginAdmin(db, w.id, { email, password: String(formData.get("password") ?? ""), code: String(formData.get("code") ?? "") })
    : null;
  if (!token) return { error: "Those details aren't right. Check your email, the password and the newest code in your app." };

  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SEVEN_DAYS });
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}
