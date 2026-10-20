import { existsSync } from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { classifyDbError } from "../src/lib/db/errors";
import { maskConnectionDetails, planMigration } from "./migrate-config";

// Довільна стала: серіалізує одночасні міграції кількох деплоїв на одній БД.
const MIGRATION_LOCK_ID = 7_461_210_042;

const HINTS: Record<string, string> = {
  unreachable:
    "БД недоступна. Якщо це Supabase Free, проєкт міг бути призупинений через неактивність: " +
    "відкрийте дашборд Supabase, натисніть «Restore project» і перезапустіть деплой.",
  auth_failed: "Відмова в автентифікації. Перевірте змінні підключення Supabase у налаштуваннях проєкту Vercel.",
};

async function main() {
  // Локально підхоплюємо `.env.local`, як і Next.js; наявні змінні середовища не перезаписуються.
  if (process.env.VERCEL !== "1" && existsSync(".env.local")) process.loadEnvFile(".env.local");

  const plan = planMigration(process.env);
  if (plan.action === "skip") {
    console.warn(`[migrate] ⚠ ${plan.message}`);
    return;
  }
  if (plan.action === "fail") {
    console.error(`[migrate] ✖ ${plan.message}`);
    process.exitCode = 1;
    return;
  }

  const urls = [process.env.POSTGRES_URL_NON_POOLING, process.env.POSTGRES_URL].filter((u): u is string => !!u);
  console.log(`[migrate] Застосовую міграції (${plan.source})…`);

  // max: 1 — advisory lock і міграції йдуть одним з'єднанням (однією сесією).
  const sql = postgres(plan.url, { max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} });
  try {
    await sql`select pg_advisory_lock(${MIGRATION_LOCK_ID})`;
    try {
      await migrate(drizzle(sql), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    } finally {
      await sql`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
    }
    console.log("[migrate] ✔ Міграції актуальні.");
  } catch (error) {
    const code = classifyDbError(error);
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`[migrate] ✖ Помилка міграцій (${code}): ${maskConnectionDetails(detail, urls)}`);
    if (HINTS[code]) console.error(`[migrate] ${HINTS[code]}`);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main();
