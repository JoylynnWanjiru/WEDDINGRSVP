// Shared helpers for app/api route handlers: thin adapters around services.

import { isAppError } from "./errors";

/** Maps AppError to its status; anything else is a 500 with no internal details leaked. */
export function errorResponse(err: unknown): Response {
  if (isAppError(err)) return Response.json({ error: err.code, message: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ error: "INTERNAL", message: "Something went wrong." }, { status: 500 });
}
