import { z } from "zod";

// Спільні для сервера й браузера частини env-валідації: лише публічні змінні `NEXT_PUBLIC_*`.

export type EnvSource = Record<string, string | undefined>;

/** Порожній рядок вважається незаданим значенням. */
export const emptyAsUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema);

export const clientShape = {
  NEXT_PUBLIC_SUPABASE_URL: emptyAsUndefined(z.url({ protocol: /^https?$/ })),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: emptyAsUndefined(z.string().min(1)),
};

export const clientEnvSchema = z.object(clientShape);

export type ClientEnv = z.infer<typeof clientEnvSchema>;

/** Проблема зі змінною: лише назва й тип, ніколи не значення. */
export interface EnvIssue {
  variable: string;
  problem: "missing" | "invalid";
}

export type EnvResult<T> = { ok: true; env: T } | { ok: false; issues: EnvIssue[] };

export class ConfigError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    super(`Невалідна конфігурація інстансу. Перевірте змінні: ${variables.join(", ")}`);
    this.name = "ConfigError";
    this.variables = variables;
  }
}

export function parseWith<T>(schema: z.ZodType<T>, source: EnvSource): EnvResult<T> {
  const result = schema.safeParse(source);
  if (result.success) return { ok: true, env: result.data };

  const issues = new Map<string, EnvIssue>();
  for (const issue of result.error.issues) {
    const variable = String(issue.path[0] ?? "");
    if (!variable || issues.has(variable)) continue;
    const raw = source[variable];
    const missing = raw === undefined || raw.trim() === "";
    issues.set(variable, { variable, problem: missing ? "missing" : "invalid" });
  }
  return { ok: false, issues: [...issues.values()] };
}

export function parseClientEnv(source: EnvSource): EnvResult<ClientEnv> {
  return parseWith(clientEnvSchema, source);
}
