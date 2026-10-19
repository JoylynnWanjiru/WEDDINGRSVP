// A real usher session for tests: PIN set, login, requireUsher. Never forged.

import { loginUsher, requireUsher, setUsherPin, type UsherSession } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";

export async function usherFor(db: Db, weddingId: string, device = "Gate 1"): Promise<UsherSession> {
  await setUsherPin(db, weddingId, "4821");
  return requireUsher(db, await loginUsher(db, weddingId, "4821", device));
}
