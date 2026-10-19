// A real admin session for tests: built through loginAdmin/requireAdmin, never forged.

import { hashSecret, loginAdmin, requireAdmin } from "@/server/auth/sessions";
import type { AdminCtx } from "@/server/services/admin/context";

const PASSWORD = "test-admin-password";
let token: string | null = null;

export async function adminCtx(weddingId: string): Promise<AdminCtx> {
  if (!token) {
    process.env.ADMIN_PASSWORD_HASH = await hashSecret(PASSWORD);
    token = await loginAdmin(PASSWORD);
  }
  return { session: await requireAdmin(token), weddingId };
}
