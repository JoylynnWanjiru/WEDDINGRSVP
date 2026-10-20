// Usage: npm run db:check
// End-to-end check against the REAL database in .env.local (Neon). It creates a
// throwaway wedding called "smoke-test-…", runs the key flows through the real
// services, and deletes it again at the end. Your seeded wedding is untouched.
// Prints only the database host, never the connection string.

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { hashSecret, loginAdmin, requireAdmin, loginUsher, requireUsher, setUsherPin } from "../server/auth/sessions";
import { config } from "../server/config";
import { getDb } from "../server/db/client";
import { invitations, weddings } from "../server/db/schema";
import { seedWedding } from "../server/db/seed";
import { getAccess } from "../server/services/access";
import { approveInvitation } from "../server/services/admin/approvals";
import { addInvitation, getInviteLink } from "../server/services/admin/guests";
import { admit, passTokenFor, scanUrl } from "../server/services/gate";
import { getInvitationPage } from "../server/services/invitation-page";
import { submitRsvp } from "../server/services/rsvp";

let failures = 0;
async function step(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}\n      ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  for (const name of ["DATABASE_URL", "TOKEN_SECRET", "APP_URL"]) {
    if (!process.env[name]) {
      console.error(`${name} is missing from .env.local (see docs/SETUP.md).`);
      process.exit(1);
    }
  }

  const db = getDb();
  console.log(`\nChecking ${new URL(config.databaseUrl()).host}\n`);
  const slug = `smoke-test-${randomUUID().slice(0, 8)}`;
  let weddingId: string | undefined;

  try {
    await step("connect", async () => {
      const { rows: [row] } = (await db.execute(sql`select 1 as ok`)) as unknown as { rows: { ok: number }[] };
      assert(row?.ok === 1, "select 1 failed");
    });

    await step("tables exist (run `npm run db:migrate` if not)", async () => {
      const res = (await db.execute(
        sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('weddings','invitations','invitation_requests','check_ins','email_queue')`,
      )) as unknown as { rows: { n: number }[] };
      assert(res.rows[0].n === 5, `expected 5 core tables, found ${res.rows[0].n}`);
    });

    await step("seeded wedding exists (run `npm run db:seed` if not)", async () => {
      const [w] = await db.select({ id: weddings.id }).from(weddings).where(eq(weddings.slug, config.weddingSlug()));
      assert(w, `no wedding with slug "${config.weddingSlug()}"`);
    });

    // A throwaway wedding for the flow checks.
    weddingId = (await seedWedding(db, slug)).id;
    process.env.ADMIN_PASSWORD_HASH = await hashSecret("smoke-test-password"); // in memory only
    const ctx = { session: await requireAdmin(await loginAdmin("smoke-test-password")), weddingId };
    let invitationId = "";
    let token = "";

    await step("admin adds a guest; personal link works", async () => {
      invitationId = (await addInvitation(db, ctx, { fullName: "Smoke Test Guest", seatAllowance: 2 })).id;
      token = (await getInviteLink(db, ctx, invitationId)).split("/i/")[1];
      assert((await getAccess(db, token)).level === "invited", "link didn't resolve to the guest");
    });

    await step("guest RSVPs Yes with 2 extras → awaiting approval, nothing unlocked", async () => {
      const res = await submitRsvp(db, token, { attending: true, primary: { fullName: "Smoke Test Guest" }, extras: [{ fullName: "Extra A" }, { fullName: "Extra B" }] }, { now: new Date("2026-11-01T10:00:00+03:00") });
      assert(res.status === "awaiting_approval" && res.partySize === 3, JSON.stringify(res));
      const page = await getInvitationPage(db, token);
      assert(!("content" in page), "content leaked before approval");
    });

    await step("admin approves → full content unlocked", async () => {
      await approveInvitation(db, ctx, invitationId);
      const page = await getInvitationPage(db, token);
      assert(page.level === "approved" && "content" in page && page.content, "content missing after approval");
    });

    await step("two ushers admit 2 each at the same moment → never over-admits (real Postgres locks)", async () => {
      await setUsherPin(db, weddingId!, "4821");
      const gate1 = await requireUsher(db, await loginUsher(db, weddingId!, "4821", "Gate 1"));
      const gate2 = await requireUsher(db, await loginUsher(db, weddingId!, "4821", "Gate 2"));
      const [inv] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
      const pass = scanUrl(await passTokenFor(inv));
      const day = { now: new Date("2026-12-12T12:00:00+03:00") };
      const results = await Promise.allSettled([admit(db, gate1, { scanned: pass }, 2, day), admit(db, gate2, { scanned: pass }, 2, day)]);
      const [after] = await db.select({ arrived: invitations.arrivedCount }).from(invitations).where(eq(invitations.id, invitationId));
      assert(results.filter((r) => r.status === "fulfilled").length === 1, "expected exactly one admit to succeed");
      assert(after.arrived === 2, `arrived is ${after.arrived}, expected 2`);
    });
  } finally {
    if (weddingId) await db.delete(weddings).where(eq(weddings.id, weddingId)); // cascades to everything it created
    console.log(failures ? `\n✗ ${failures} check(s) failed.` : "\n✓ All checks passed. The throwaway wedding was deleted.");
    process.exit(failures ? 1 : 0);
  }
}

void main();
