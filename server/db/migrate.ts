// `npm run db:migrate`: applies server/db/migrations to DATABASE_URL (from .env.local).
// Safe to run again: already-applied migrations are skipped.
// Scripts wrap their code in main(): tsx runs .ts as CommonJS here, so no top-level await.

import { config as loadEnv } from "dotenv";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

loadEnv({ path: ".env.local", quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local (see docs/SETUP.md, step 1).");
    process.exit(1);
  }

  const host = new URL(url).host; // never print the full URL: it contains the password
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "server/db/migrations" });
    console.log(`✓ Migrations applied to ${host}`);
  } catch (err) {
    console.error(`✗ Migration failed on ${host}: ${(err as Error).message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
