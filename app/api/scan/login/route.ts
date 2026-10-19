// Usher PIN login: sets the HTTP-only scanner session cookie (A6, E20).
import { USHER_COOKIE } from "@/server/auth/sessions";
import { config } from "@/server/config";
import { getDb } from "@/server/db/client";
import { clientIp, errorResponse, jsonBody, sessionCookie } from "@/server/http";
import { usherLogin } from "@/server/services/gate-login";

const EIGHTEEN_HOURS = 18 * 60 * 60;

export async function POST(request: Request) {
  const body = await jsonBody(request);
  const ip = clientIp(request);
  try {
    const token = await usherLogin(getDb(), body, { weddingSlug: config.weddingSlug(), clientId: ip });
    return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(USHER_COOKIE, token, EIGHTEEN_HOURS) } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Sign out this device. */
export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(USHER_COOKIE, "", 0) } });
}
