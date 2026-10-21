// Admin CSV exports: guests | dietary | headcount | checkins (§8, N4). Admin session only;
// every download is logged (D13). Files carry personal data, so they are never cached.
import { ADMIN_COOKIE } from "@/server/auth/sessions";
import { config } from "@/server/config";
import { getDb } from "@/server/db/client";
import { errorResponse, readCookie } from "@/server/http";
import { getAdminContext } from "@/server/services/admin/context";
import { exportCsv } from "@/server/services/admin/exports";

export async function GET(request: Request, route: RouteContext<"/api/export/[kind]">) {
  // Read the request before try/catch: it is how Next.js leaves prerendering, and catching that would break it.
  const { kind } = await route.params;
  const session = readCookie(request, ADMIN_COOKIE);
  try {
    const db = getDb();
    const ctx = await getAdminContext(db, session, config.weddingSlug());
    const { filename, csv } = await exportCsv(db, ctx, kind);
    const today = new Date().toISOString().slice(0, 10);
    // The BOM makes Excel read the file as UTF-8 (names with accents, the en dash in times).
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename.replace(".csv", `-${today}.csv`)}"`,
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
