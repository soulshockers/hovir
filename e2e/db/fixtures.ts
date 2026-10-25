import { existsSync } from "node:fs";

import { test as base, expect, type APIRequestContext } from "@playwright/test";
import postgres from "postgres";

import { deriveClientKey } from "../../src/lib/http/client-key";
import { removeTestMedia } from "../../tests/support/media-cleanup";
import { testClientIp } from "./config";

// Набір іде в окрему dev-базу з `.env.local`. Прибираємо лише свої дані: презентації з префіксом `[test]`
// і рядки лімітів тестових клієнтів (198.51.100.0/24), щоб ліміти не накопичувались між тестами й запусками.

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const TEST_TITLE_PREFIX = "[test]";

const sql = postgres(process.env.POSTGRES_URL!, { max: 2, prepare: false, onnotice: () => {} });
const testKeys = [1, 2].map((n) => deriveClientKey(testClientIp(n), process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""));

async function cleanup() {
  await removeTestMedia(sql, TEST_TITLE_PREFIX);
  await sql`delete from presentations where title like ${TEST_TITLE_PREFIX + "%"}`;
  await sql`delete from rate_limits where client_key in ${sql(testKeys)}`;
}

export interface Created {
  id: string;
  title: string;
  editToken: string;
  presentToken: string;
}

export async function createViaApi(request: APIRequestContext, title = "презентація", password?: string): Promise<Created> {
  const response = await request.post("/api/presentations", { data: { title: `${TEST_TITLE_PREFIX} ${title}`, password } });
  expect(response.status()).toBe(201);
  return response.json();
}

export const test = base.extend<{ sql: postgres.Sql; clean: void }>({
  sql: async ({}, provide) => {
    await provide(sql);
  },
  clean: [
    async ({}, provide) => {
      await cleanup();
      await provide();
      await cleanup();
    },
    { auto: true },
  ],
});

export { expect };
