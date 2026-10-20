import { z } from "zod";

import { clientShape, emptyAsUndefined, parseWith, type EnvResult, type EnvSource } from "./common";

export { ConfigError, parseClientEnv, clientEnvSchema, type ClientEnv, type EnvIssue, type EnvResult } from "./common";

// Повна серверна схема env (openspec/specs/runtime-config/spec.md). Клієнтська частина — у `./common`, щоб у браузерний бандл
// не потрапляли навіть назви серверних змінних.

const postgresUrl = z
  .string()
  .refine((value) => /^postgres(ql)?:\/\/.+/.test(value), { message: "Очікується Postgres URL" });

export const LOCALES = ["uk", "en"] as const;

export const serverEnvSchema = z.object({
  ...clientShape,
  SUPABASE_SERVICE_ROLE_KEY: emptyAsUndefined(z.string().min(1)),
  POSTGRES_URL: emptyAsUndefined(postgresUrl),
  POSTGRES_URL_NON_POOLING: emptyAsUndefined(postgresUrl.optional()),
  INSTANCE_PASSWORD: emptyAsUndefined(z.string().optional()),
  DEFAULT_LOCALE: emptyAsUndefined(z.enum(LOCALES).default("uk")),
  RESULTS_RETENTION_DAYS: emptyAsUndefined(z.coerce.number().int().positive().default(90)),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: EnvSource): EnvResult<ServerEnv> {
  return parseWith(serverEnvSchema, source);
}
