// Daily cron: queue no-response and day-before reminders, then send (BR-19, N1).
import { requireCron } from "@/server/auth/cron";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { createGmailMailer } from "@/server/integrations/mailer";
import { runReminders } from "@/server/services/cron";

export async function GET(request: Request) {
  // Read the request before try/catch: it is how Next.js leaves prerendering, and catching that would break it.
  const authorization = request.headers.get("authorization");
  try {
    requireCron(authorization);
    return Response.json(await runReminders(getDb(), createGmailMailer()));
  } catch (err) {
    return errorResponse(err);
  }
}
