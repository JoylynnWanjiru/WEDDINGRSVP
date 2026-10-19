// Scanner: find an approved guest by name, for guests without a phone (E18).
import { requireUsher, USHER_COOKIE } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { errorResponse, readCookie } from "@/server/http";
import { searchAtGate } from "@/server/services/gate";

export async function GET(request: Request) {
  // Read the request before try/catch (Cache Components prerendering, see CLAUDE.md).
  const session = readCookie(request, USHER_COOKIE);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const db = getDb();
    return Response.json(await searchAtGate(db, await requireUsher(db, session), q));
  } catch (err) {
    return errorResponse(err);
  }
}
