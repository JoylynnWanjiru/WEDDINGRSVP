import "server-only";

// Admin Data Access Layer (Next.js authentication guide): the one place that turns the
// session cookie into an AdminCtx. Pages call getAdmin() inside a <Suspense> boundary;
// every Server Action calls it again itself, because a layout doesn't protect actions.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ADMIN_COOKIE } from "@/server/auth/sessions";
import { config } from "@/server/config";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { getAdminContext, type AdminCtx } from "@/server/services/admin/context";

/** The signed-in admin for this request, or a redirect to the login page. Deduped per request. */
export const getAdmin = cache(async (): Promise<AdminCtx> => {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  try {
    return await getAdminContext(getDb(), token, config.weddingSlug());
  } catch (err) {
    if (isAppError(err) && err.code === "UNAUTHORIZED") redirect("/admin/login");
    throw err;
  }
});
