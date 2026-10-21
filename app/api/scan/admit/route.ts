// Scanner: admit N people from a scanned pass or a name search (BR-14, BR-16, E18), guests or vendors (D25).
import { requireUsher, USHER_COOKIE } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { errorResponse, jsonBody, readCookie } from "@/server/http";
import { admit } from "@/server/services/gate";

type Body = { scanned?: unknown; invitationId?: unknown; vendorId?: unknown; count?: unknown; clientRef?: unknown } | null;

export async function POST(request: Request) {
  const session = readCookie(request, USHER_COOKIE);
  const body = (await jsonBody(request)) as Body;
  try {
    const db = getDb();
    const usher = await requireUsher(db, session);
    const count = Number(body?.count);
    const clientRef = typeof body?.clientRef === "string" ? body.clientRef.slice(0, 64) : undefined;
    if (typeof body?.scanned === "string") return Response.json(await admit(db, usher, { scanned: body.scanned }, count, { clientRef }));
    if (typeof body?.invitationId === "string") {
      return Response.json(await admit(db, usher, { invitationId: body.invitationId }, count, { clientRef }));
    }
    if (typeof body?.vendorId === "string") return Response.json(await admit(db, usher, { vendorId: body.vendorId }, count, { clientRef })); // D25
    throw new AppError("VALIDATION", "Scan a pass or choose a guest.");
  } catch (err) {
    return errorResponse(err);
  }
}
