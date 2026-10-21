// In-memory Postgres (PGlite) with the real migrations applied. No account, no network.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { hashToken, inviteTokenFor } from "@/server/auth/tokens";
import type { Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { seedWedding } from "@/server/db/seed";
import type { InvitationStatus } from "@/server/domain/status";

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "server/db/migrations" });
  return { db: db as unknown as Db, close: () => client.close() };
}

let slugCounter = 0;

/**
 * A fresh wedding per test keeps tests isolated within one database. Auto-approval
 * (D24) is off so tests drive approval explicitly; tests of D24 turn it on.
 */
export async function createWedding(db: Db, opts: { autoApprove?: boolean } = {}) {
  const wedding = await seedWedding(db, `test-wedding-${++slugCounter}`);
  const autoApprove = opts.autoApprove ?? false;
  await db.update(schema.weddings).set({ autoApprove }).where(eq(schema.weddings.id, wedding.id));
  return { ...wedding, autoApprove };
}

export async function createInvitation(
  db: Db,
  weddingId: string,
  values: Partial<typeof schema.invitations.$inferInsert> & { status?: InvitationStatus } = {},
) {
  const id = values.id ?? randomUUID();
  const version = values.inviteTokenVersion ?? 1;
  const token = inviteTokenFor(id, version);
  const [invitation] = await db
    .insert(schema.invitations)
    .values({ fullName: "Test Guest", ...values, id, weddingId, inviteTokenHash: hashToken(token) })
    .returning();
  return { invitation, token };
}
