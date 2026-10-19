// Database client. Production/dev use Neon over WebSockets (supports transactions);
// tests pass a PGlite-backed instance of the same `Db` type into services.

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { config } from "../config";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

let instance: Db | undefined;

export function getDb(): Db {
  instance ??= drizzle({ client: new Pool({ connectionString: config.databaseUrl() }), schema }) as unknown as Db;
  return instance;
}
