import "server-only";

import postgres from "postgres";

import { classifyDbError, TimeoutError, type DbErrorCode } from "@/lib/db/errors";
import { maskConnectionDetails } from "@/lib/db/mask";
import type { EnvResult, ServerEnv } from "@/lib/env/schema";
import { getServerEnvResult } from "@/lib/env/server";

import type { CheckResult, HealthReport } from "./types";

/** Мінімальний інтерфейс БД для перевірок — дає змогу підміняти його в тестах. */
export interface HealthDbConnection {
  ping(): Promise<void>;
  /** `true`, якщо службовий запис інстансу існує. */
  isInitialized(): Promise<boolean>;
  close(): void;
}

export interface HealthDeps {
  getEnvResult: () => EnvResult<ServerEnv>;
  openDatabase: (url: string) => HealthDbConnection;
  fetch: typeof fetch;
  logError: (message: string) => void;
  now: () => Date;
  /** Тайм-аут кожної мережевої перевірки (≤ 5 с за специфікацією). */
  timeoutMs: number;
}

const OK: CheckResult = { status: "ok" };
const SKIPPED: CheckResult = { status: "skipped" };
const fail = (code: CheckResult["code"]): CheckResult => ({ status: "error", code });

function openPostgres(url: string): HealthDbConnection {
  // Окреме короткоживуче з'єднання, щоб зависле підключення не «отруїло» runtime-клієнт.
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 4, idle_timeout: 1, onnotice: () => {} });
  return {
    async ping() {
      await sql`select 1`;
    },
    async isInitialized() {
      const rows = await sql`select installed_at from instance_meta where id = 1`;
      return rows.length > 0;
    },
    close() {
      sql.end({ timeout: 0 }).catch(() => {});
    },
  };
}

const defaultDeps: HealthDeps = {
  getEnvResult: getServerEnvResult,
  openDatabase: openPostgres,
  fetch: (...args) => fetch(...args),
  logError: (message) => console.error(message),
  now: () => new Date(),
  timeoutMs: 4000,
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return `${error.name}${typeof code === "string" ? ` [${code}]` : ""}: ${error.message}`;
  }
  return String(error);
}

async function checkDatabase(env: ServerEnv, deps: HealthDeps): Promise<{ database: CheckResult; schema: CheckResult }> {
  const urls = [env.POSTGRES_URL, env.POSTGRES_URL_NON_POOLING].filter((url): url is string => !!url);
  const log = (check: string, code: DbErrorCode, error: unknown) =>
    deps.logError(`[health] ${check}: ${code}: ${maskConnectionDetails(describeError(error), urls)}`);

  let stage: "database" | "schema" = "database";
  let connection: HealthDbConnection | undefined;
  try {
    // Один тайм-аут на всю перевірку БД: підключення + обидва запити.
    return await withTimeout(
      (async () => {
        connection = deps.openDatabase(env.POSTGRES_URL);
        await connection.ping();
        stage = "schema";
        const initialized = await connection.isInitialized();
        return { database: OK, schema: initialized ? OK : fail("schema_not_initialized") };
      })(),
      deps.timeoutMs,
      "database",
    );
  } catch (error) {
    const code = classifyDbError(error);
    log(stage, code, error);
    if (stage === "database") {
      return { database: fail(code === "schema_not_initialized" ? "unknown" : code), schema: SKIPPED };
    }
    return { database: OK, schema: fail(code) };
  } finally {
    connection?.close();
  }
}

async function checkSupabaseApi(env: ServerEnv, deps: HealthDeps): Promise<CheckResult> {
  const url = new URL("/auth/v1/health", env.NEXT_PUBLIC_SUPABASE_URL);
  try {
    const response = await deps.fetch(url, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(deps.timeoutMs),
      cache: "no-store",
    });
    if (response.ok) return OK;
    deps.logError(`[health] supabaseApi: HTTP ${response.status}`);
    if (response.status === 401 || response.status === 403) return fail("invalid_key");
    // 5xx і нестандартні статуси (зокрема в призупиненого проєкту) — сервіс недоступний.
    if (response.status >= 500) return fail("unreachable");
    return fail("unknown");
  } catch (error) {
    deps.logError(`[health] supabaseApi: unreachable: ${describeError(error)}`);
    return fail("unreachable");
  }
}

/** Виконує всі перевірки стану паралельно. Ніколи не кидає винятків. */
export async function runHealthChecks(overrides: Partial<HealthDeps> = {}): Promise<HealthReport> {
  const deps = { ...defaultDeps, ...overrides };
  const checkedAt = deps.now().toISOString();
  const envResult = deps.getEnvResult();

  if (!envResult.ok) {
    return {
      status: "error",
      checkedAt,
      checks: {
        config: { status: "error", code: "config_invalid", issues: envResult.issues },
        database: SKIPPED,
        supabaseApi: SKIPPED,
        schema: SKIPPED,
      },
    };
  }

  const [db, supabaseApi] = await Promise.all([checkDatabase(envResult.env, deps), checkSupabaseApi(envResult.env, deps)]);
  const checks = { config: OK, database: db.database, supabaseApi, schema: db.schema };
  const status = Object.values(checks).every((check) => check.status === "ok") ? "ok" : "error";
  return { status, checkedAt, checks };
}
