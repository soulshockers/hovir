import { ConfigError, parseClientEnv, type ClientEnv } from "./common";

/** Next.js інлайнить у клієнтський бандл лише буквальні звернення до `process.env.NEXT_PUBLIC_*`. */
export function getClientEnv(): ClientEnv {
  const result = parseClientEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!result.ok) throw new ConfigError(result.issues.map((issue) => issue.variable));
  return result.env;
}
