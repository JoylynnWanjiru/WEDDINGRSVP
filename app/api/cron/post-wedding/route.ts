// Daily cron: delete guest data `purgeAfterDays` after the wedding (BR-23).
import { requireCron } from "@/server/auth/cron";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { runPostWedding } from "@/server/services/cron";

export async function GET(request: Request) {
  // Read the request before try/catch: it is how Next.js leaves prerendering, and catching that would break it.
  const authorization = request.headers.get("authorization");
  try {
    requireCron(authorization);
    return Response.json(await runPostWedding(getDb()));
  } catch (err) {
    return errorResponse(err);
  }
}
