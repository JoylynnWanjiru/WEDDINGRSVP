// Usage: npm run admin:add -- "Your Name" you@example.com
// Adds an admin to the wedding in .env.local's database and prints their one-time setup
// link (BLUEPRINT D26). Use it for the very first admin, or if every admin has lost their
// phone. Run again with an existing email to reset that person's authenticator instead.
// Afterwards, add and manage everyone else from Settings → Who can sign in.

import { and, eq } from "drizzle-orm";
import { adminSetupLink, createAdmin, resetAdminAuthenticator } from "../server/auth/admins";
import { config } from "../server/config";
import { getDb } from "../server/db/client";
import { admins, weddings } from "../server/db/schema";
import { logActivity } from "../server/services/activity";
import { adminInput, parseInput } from "../server/validation/schemas";

async function main() {
  const [name, email] = process.argv.slice(2);
  if (!name || !email) {
    console.error('Usage: npm run admin:add -- "Your Name" you@example.com');
    process.exit(1);
  }
  const input = parseInput(adminInput, { name, email });
  const db = getDb();
  const [w] = await db.select({ id: weddings.id }).from(weddings).where(eq(weddings.slug, config.weddingSlug()));
  if (!w) {
    console.error(`No wedding with slug "${config.weddingSlug()}". Run \`npm run db:seed\` first.`);
    process.exit(1);
  }

  const [existing] = await db.select().from(admins).where(and(eq(admins.weddingId, w.id), eq(admins.email, input.email)));
  const admin = existing ? await resetAdminAuthenticator(db, w.id, existing.id) : await createAdmin(db, w.id, input);
  const action = existing ? "admin_authenticator_reset" : "admin_added";
  await logActivity(db, { weddingId: w.id, actor: "system", actorLabel: "admin:add script", action, meta: { name: admin.name } });

  console.log(existing ? `\nReset ${admin.name}'s authenticator.` : `\nAdded ${admin.name}.`);
  console.log("Open this link on a computer and scan the QR code with an authenticator app (works once, for 3 days):\n");
  console.log(await adminSetupLink(admin));
  process.exit(0);
}

void main();
