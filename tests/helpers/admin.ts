// A real admin session for tests: a named admin who set up an authenticator and signed in
// through loginAdmin/requireAdmin (D26), never forged. One admin per wedding.

import { adminSetupLink, confirmAdminSetup, createAdmin } from "@/server/auth/admins";
import { hashSecret, loginAdmin, requireAdmin } from "@/server/auth/sessions";
import { codeAt, stepAt, totpSecretFor } from "@/server/auth/totp";
import type { Db } from "@/server/db/client";
import type { AdminCtx } from "@/server/services/admin/context";

export const ADMIN_PASSWORD = "test-admin-password";
let hashed = false;
const tokens = new Map<string, string>();

export async function adminCtx(db: Db, weddingId: string, who = { name: "Test Admin", email: "admin@example.com" }): Promise<AdminCtx> {
  if (!hashed) {
    process.env.ADMIN_PASSWORD_HASH = await hashSecret(ADMIN_PASSWORD);
    hashed = true;
  }
  const key = `${weddingId}:${who.email}`;
  let token = tokens.get(key);
  if (!token) {
    const admin = await createAdmin(db, weddingId, who);
    const secret = totpSecretFor(admin.id, admin.setupVersion);
    const now = new Date();
    await confirmAdminSetup(db, setupToken(await adminSetupLink(admin)), codeAt(secret, stepAt(now)), now);
    const later = new Date(now.getTime() + 30_000); // each code works once, so sign in with the next one
    token = (await loginAdmin(db, weddingId, { email: who.email, password: ADMIN_PASSWORD, code: codeAt(secret, stepAt(later)) }, later))!;
    tokens.set(key, token);
  }
  return { session: await requireAdmin(db, token), weddingId };
}

/** The session cookie value behind an adminCtx(), to check it stops working. */
export const sessionTokenOf = (weddingId: string, email: string) => tokens.get(`${weddingId}:${email}`)!;

export const setupToken =(link: string) => link.split("/admin/setup/")[1];
