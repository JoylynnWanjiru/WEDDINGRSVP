// `npm run db:migrate`: applies server/db/migrations to DATABASE_URL (from .env.local).

import { config as loadEnv } from "dotenv";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

loadEnv({ path: ".env.local", quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await migrate(drizzle({ client: pool }), { migrationsFolder: "server/db/migrations" });
await pool.end();
console.log("Migrations applied");
