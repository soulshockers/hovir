import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Smoke-тести не потребують живого Supabase: застосунок стартує з порожньою конфігурацією,
// а міграції під час локального білда пропускаються.
const EMPTY_SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  POSTGRES_URL: "",
  POSTGRES_URL_NON_POOLING: "",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Бінарники з node_modules/.bin (є в PATH під час `pnpm test:e2e`); міграції без БД однаково пропускаються.
    command: "next build && next start",
    // `/api/health` без БД віддає 503, а Playwright вважає готовим лише 2xx/3xx — тож чекаємо на головну.
    url: `http://localhost:${PORT}/`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: { ...EMPTY_SUPABASE_ENV, PORT: String(PORT) },
  },
});
