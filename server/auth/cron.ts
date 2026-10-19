// Cron routes (BLUEPRINT §4 System actor). Vercel Cron sends
// "Authorization: Bearer <CRON_SECRET>"; anything else is refused.

import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "../config";
import { AppError } from "../errors";

const digest = (s: string) => createHash("sha256").update(s).digest();

export function requireCron(authorization: string | null | undefined): void {
  const expected = digest(`Bearer ${config.cronSecret()}`);
  if (!authorization || !timingSafeEqual(digest(authorization), expected)) {
    throw new AppError("UNAUTHORIZED", "Not allowed.");
  }
}
