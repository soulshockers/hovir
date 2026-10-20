import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

import { E2E_INSTANCE_PASSWORD, E2E_PORTS, testClientIp } from "./e2e/db/config";

// Smoke-тести не потребують живого Supabase: застосунок стартує з порожньою конфігурацією,
// а міграції під час локального білда пропускаються.
const EMPTY_SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  POSTGRES_URL: "",
  POSTGRES_URL_NON_POOLING: "",
};

// Набір `e2e/db/` іде в окрему dev-базу з `.env.local` (`next start` підхоплює файл сам).
// Env читається один раз на процес, тож відкритий і захищений інстанси — два окремі сервери.
const hasDatabaseEnv = existsSync(".env.local");

const smokeServer = {
  // Бінарники з node_modules/.bin (є в PATH під час `pnpm test:e2e`); міграції без БД однаково пропускаються.
  // Сервери стартують по черзі, тож білд перших виконується до запуску решти.
  command: `next build && next start -p ${E2E_PORTS.smoke}`,
  // `/api/health` без БД віддає 503, а Playwright вважає готовим лише 2xx/3xx — тож чекаємо на головну.
  url: `http://localhost:${E2E_PORTS.smoke}/`,
  timeout: 180_000,
  reuseExistingServer: !process.env.CI,
  env: { ...EMPTY_SUPABASE_ENV },
};

const dbServer = (port: number, password: string) => ({
  command: `tsx scripts/migrate.ts && next start -p ${port}`,
  url: `http://localhost:${port}/`,
  timeout: 60_000,
  reuseExistingServer: !process.env.CI,
  env: { INSTANCE_PASSWORD: password },
});

const dbProject = (name: string, port: number, worker: number) => ({
  name,
  testDir: "./e2e/db",
  // Dev-база віддалена: затримки окремих запитів сягають кількох секунд.
  expect: { timeout: 15_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${port}`,
    // Кожен проєкт — окремий «клієнт» з тестовою адресою (198.51.100.0/24), щоб ліміти не перетиналися.
    extraHTTPHeaders: { "x-forwarded-for": testClientIp(worker) },
  },
});

export default defineConfig({
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { trace: "on-first-retry" },
  projects: [
    {
      name: "smoke",
      testDir: "./e2e",
      testIgnore: "db/**",
      fullyParallel: true,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${E2E_PORTS.smoke}` },
    },
    ...(hasDatabaseEnv
      ? [
          { ...dbProject("db-open", E2E_PORTS.open, 1), grepInvert: /@protected/ },
          { ...dbProject("db-protected", E2E_PORTS.protected, 2), grep: /@protected/ },
        ]
      : []),
  ],
  // Тести з БД ділять ліміти одного клієнта — у межах проєкту виконуються послідовно.
  workers: 1,
  webServer: [
    smokeServer,
    ...(hasDatabaseEnv
      ? [dbServer(E2E_PORTS.open, ""), dbServer(E2E_PORTS.protected, E2E_INSTANCE_PASSWORD)]
      : []),
  ],
});
