import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getServerEnv } from "@/lib/env/server";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

let db: Database | undefined;

/**
 * Лінивий Drizzle-клієнт на `POSTGRES_URL` (Supavisor transaction mode):
 * без prepared statements, одне з'єднання на інстанс функції.
 */
export function getDb(): Database {
  if (!db) {
    const client = postgres(getServerEnv().POSTGRES_URL, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    db = drizzle(client, { schema });
  }
  return db;
}
