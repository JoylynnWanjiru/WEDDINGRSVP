// Daily cron: safety net for the email queue (BLUEPRINT D7). "Send now" in admin is the main path.
import { requireCron } from "@/server/auth/cron";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { createGmailMailer } from "@/server/integrations/mailer";
import { runSendQueue } from "@/server/services/cron";

export async function GET(request: Request) {
  // Read the request before try/catch: it is how Next.js leaves prerendering, and catching that would break it.
  const authorization = request.headers.get("authorization");
  try {
    requireCron(authorization);
    return Response.json(await runSendQueue(getDb(), createGmailMailer()));
  } catch (err) {
    return errorResponse(err);
  }
}
