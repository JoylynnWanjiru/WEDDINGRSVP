// Append-only audit trail (BLUEPRINT §13). Every status transition and check-in is logged.
// Never put phone numbers, emails or tokens in `meta`.

import type { Db } from "../db/client";
import { activityLog } from "../db/schema";

export type Actor = "admin" | "guest" | "usher" | "system" | "public";

export type ActivityEntry = {
  weddingId: string;
  actor: Actor;
  actorLabel?: string;
  invitationId?: string;
  vendorId?: string; // D25
  action: string;
  meta?: Record<string, unknown>;
};

export async function logActivity(db: Db, entry: ActivityEntry): Promise<void> {
  await db.insert(activityLog).values(entry);
}
