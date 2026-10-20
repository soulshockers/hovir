// Чиста логіка скрипта міграцій (design.md D3), винесена для unit-тестів.

export { maskConnectionDetails } from "../src/lib/db/mask";

type EnvSource = Record<string, string | undefined>;

export type MigrationPlan =
  | { action: "run"; url: string; source: "POSTGRES_URL_NON_POOLING" | "POSTGRES_URL" }
  | { action: "skip"; message: string }
  | { action: "fail"; message: string };

const nonEmpty = (value: string | undefined) => (value && value.trim() !== "" ? value.trim() : undefined);

export function planMigration(env: EnvSource): MigrationPlan {
  const nonPooling = nonEmpty(env.POSTGRES_URL_NON_POOLING);
  if (nonPooling) return { action: "run", url: nonPooling, source: "POSTGRES_URL_NON_POOLING" };
  const pooled = nonEmpty(env.POSTGRES_URL);
  if (pooled) return { action: "run", url: pooled, source: "POSTGRES_URL" };

  if (env.VERCEL === "1") {
    return {
      action: "fail",
      message:
        "Не задано POSTGRES_URL. Підключіть Supabase до проєкту через Vercel Marketplace " +
        "(Project → Storage → Supabase) і перезапустіть деплой.",
    };
  }
  return {
    action: "skip",
    message: "POSTGRES_URL не задано — міграції БД пропущено (локальний білд без БД).",
  };
}
