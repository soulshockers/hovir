import { defineConfig } from "drizzle-kit";

// `generate` не потребує БД; URL потрібен лише для `drizzle-kit studio`/`check` проти реальної бази.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL ?? "",
  },
});
