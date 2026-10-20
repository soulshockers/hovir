import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getServerEnv } from "@/lib/env/server";

import { TimeoutError } from "./errors";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

/** Дедлайн роботи з БД в одному запиті застосунку (openspec/changes/add-presentation-access/design.md «Стійкий клієнт БД»). */
export const DB_DEADLINE_MS = 8000;

let current: { db: Database; client: postgres.Sql } | undefined;

/**
 * Лінивий Drizzle-клієнт на `POSTGRES_URL` (Supavisor transaction mode), без prepared statements.
 * Кілька з'єднань, щоб один завислий запит не ставив у чергу всі інші; з'єднання періодично оновлюються,
 * а TCP keep-alive виявляє напівзакриті сокети.
 */
export function getDb(): Database {
  if (!current) {
    const client = postgres(getServerEnv().POSTGRES_URL, {
      prepare: false,
      max: 3,
      idle_timeout: 20,
      max_lifetime: 5 * 60,
      keep_alive: 30,
      connect_timeout: 10,
    });
    current = { db: drizzle(client, { schema }), client };
  }
  return current.db;
}

/** Відкидає поточний пул (наприклад, із застряглим з'єднанням): наступний `getDb()` створить новий. */
export function resetDb(): void {
  const stale = current;
  current = undefined;
  stale?.client.end({ timeout: 0 }).catch(() => {});
}

/**
 * Виконує роботу з БД з дедлайном. Якщо вона не встигла, запит отримує `TimeoutError` (→ 503), а пул
 * скидається, тож застрягле з'єднання не вішає наступні запити екземпляра функції.
 */
export async function withDbDeadline<T>(work: () => Promise<T>, ms = DB_DEADLINE_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      resetDb();
      reject(new TimeoutError("db", ms));
    }, ms);
  });
  try {
    return await Promise.race([work(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
