// Scanner: approved list for the offline cache (N3, E4, E17).
import { requireUsher, USHER_COOKIE } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { errorResponse, readCookie } from "@/server/http";
import { getGateRoster } from "@/server/services/gate";

export async function GET(request: Request) {
  // Read the request before try/catch (Cache Components prerendering, see CLAUDE.md).
  const session = readCookie(request, USHER_COOKIE);
  try {
    const db = getDb();
    return Response.json(await getGateRoster(db, await requireUsher(db, session)), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
