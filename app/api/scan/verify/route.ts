// Scanner: what does this QR mean? Name and party size only (§9, BR-13, BR-15).
import { requireUsher, USHER_COOKIE } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { errorResponse, jsonBody, readCookie } from "@/server/http";
import { verifyScan } from "@/server/services/gate";

export async function POST(request: Request) {
  const session = readCookie(request, USHER_COOKIE);
  const body = (await jsonBody(request)) as { scanned?: unknown } | null;
  try {
    const db = getDb();
    const usher = await requireUsher(db, session);
    if (typeof body?.scanned !== "string") throw new AppError("VALIDATION", "Nothing was scanned.");
    return Response.json(await verifyScan(db, usher, body.scanned));
  } catch (err) {
    return errorResponse(err);
  }
}
