// Scanner: upload check-ins recorded while offline; each applies once (N3, E17).
import { requireUsher, USHER_COOKIE } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { errorResponse, jsonBody, readCookie } from "@/server/http";
import { syncOfflineCheckIns } from "@/server/services/gate";

export async function POST(request: Request) {
  const session = readCookie(request, USHER_COOKIE);
  const body = (await jsonBody(request)) as { entries?: unknown } | null;
  try {
    const db = getDb();
    const usher = await requireUsher(db, session);
    return Response.json({ results: await syncOfflineCheckIns(db, usher, body?.entries ?? []) });
  } catch (err) {
    return errorResponse(err);
  }
}
