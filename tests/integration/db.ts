import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Database } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { deriveClientKey } from "@/lib/http/client-key";

/** Префікс назв тестових презентацій: прибирання видаляє лише їх. */
export const TEST_TITLE_PREFIX = "[test]";

export const hasDatabase = !!process.env.POSTGRES_URL;

/** Ключ клієнта для тестової адреси з 198.51.100.0/24 — тим самим способом, що й застосунок. */
export const testClientKey = (ip: string) => deriveClientKey(ip, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");

/**
 * З'єднання з dev-базою з `.env.local` (Supavisor transaction mode, як у застосунку).
 * Кілька з'єднань — щоб паралельні запити справді йшли паралельно.
 */
export function openTestDb(max = 20): { sql: postgres.Sql; db: Database } {
  const sql = postgres(process.env.POSTGRES_URL!, { max, prepare: false, onnotice: () => {} });
  return { sql, db: drizzle(sql, { schema }) };
}

/** Видаляє тестові презентації та рядки лімітів лише переданих ключів клієнтів. */
export async function cleanupTestData(sql: postgres.Sql, clientKeys: string[] = []) {
  await sql`delete from presentations where title like ${TEST_TITLE_PREFIX + "%"}`;
  if (clientKeys.length > 0) await sql`delete from rate_limits where client_key in ${sql(clientKeys)}`;
}
