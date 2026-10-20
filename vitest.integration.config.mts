import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Інтеграційні тести ходять у справжню БД з `.env.local` (окрема dev-база). Без `POSTGRES_URL` набори пропускаються.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    passWithNoTests: true,
    // Набори ділять одну БД і ліміти — запускаємо файли послідовно.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
