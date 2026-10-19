// Shared helpers for app/api route handlers: thin adapters around services.
// Plain Request/Response only, so server/ stays free of Next.js imports.

import { isAppError } from "./errors";

/** Maps AppError to its status; anything else is a 500 with no internal details leaked. */
export function errorResponse(err: unknown): Response {
  if (isAppError(err)) return Response.json({ error: err.code, message: err.message, details: safeDetails(err.details) }, { status: err.status });
  console.error(err);
  return Response.json({ error: "INTERNAL", message: "Something went wrong." }, { status: 500 });
}

/** Only form-field messages and small numbers go back to the browser. */
function safeDetails(details: unknown) {
  if (!details || typeof details !== "object") return undefined;
  const d = details as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ["fields", "remaining", "overflow", "needsConfirmation"]) if (key in d) out[key] = d[key];
  return Object.keys(out).length ? out : undefined;
}

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** HTTP-only, Secure, SameSite=Lax session cookie (PROJECT_SPEC §12). maxAge 0 clears it. */
export function sessionCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

/** The client IP for rate limiting (Vercel sets x-forwarded-for). Hashed before storage. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
