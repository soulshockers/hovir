import { describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/lib/env/schema";
import { runHealthChecks, type HealthDbConnection, type HealthDeps } from "@/lib/health/checks";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-secret",
  POSTGRES_URL: "postgres://postgres.abcd:pw-Secret1@aws-0-eu.pooler.supabase.com:6543/postgres",
};

const dbError = (code: string, message = "boom from db-host.internal") => Object.assign(new Error(message), { code });

function fakeDb(overrides: Partial<HealthDbConnection> = {}): HealthDbConnection {
  return { ping: async () => {}, isInitialized: async () => true, close: () => {}, ...overrides };
}

function deps(overrides: Partial<HealthDeps> = {}) {
  const logs: string[] = [];
  const merged: Partial<HealthDeps> = {
    getEnvResult: () => parseServerEnv(env),
    openDatabase: () => fakeDb(),
    fetch: vi.fn(async () => new Response("{}", { status: 200 })),
    logError: (message) => logs.push(message),
    now: () => new Date("2026-10-20T10:00:00Z"),
    timeoutMs: 50,
    ...overrides,
  };
  return { deps: merged, logs };
}

describe("runHealthChecks", () => {
  it("повертає ok, коли все справно", async () => {
    const { deps: d } = deps();
    const report = await runHealthChecks(d);
    expect(report).toEqual({
      status: "ok",
      checkedAt: "2026-10-20T10:00:00.000Z",
      checks: { config: { status: "ok" }, database: { status: "ok" }, supabaseApi: { status: "ok" }, schema: { status: "ok" } },
    });
  });

  it("при невалідній конфігурації пропускає залежні перевірки й повідомляє лише назви змінних", async () => {
    const openDatabase = vi.fn();
    const { deps: d } = deps({ getEnvResult: () => parseServerEnv({ ...env, SUPABASE_SERVICE_ROLE_KEY: "" }), openDatabase });
    const report = await runHealthChecks(d);
    expect(report.status).toBe("error");
    expect(report.checks.config).toEqual({
      status: "error",
      code: "config_invalid",
      issues: [{ variable: "SUPABASE_SERVICE_ROLE_KEY", problem: "missing" }],
    });
    expect(report.checks.database.status).toBe("skipped");
    expect(report.checks.supabaseApi.status).toBe("skipped");
    expect(report.checks.schema.status).toBe("skipped");
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it.each([
    ["ECONNREFUSED", "unreachable"],
    ["CONNECT_TIMEOUT", "unreachable"],
    ["28P01", "auth_failed"],
    ["XX999", "unknown"],
  ])("класифікує помилку підключення %s як %s", async (code, expected) => {
    const { deps: d } = deps({ openDatabase: () => fakeDb({ ping: async () => Promise.reject(dbError(code)) }) });
    const report = await runHealthChecks(d);
    expect(report.checks.database).toEqual({ status: "error", code: expected });
    expect(report.checks.schema.status).toBe("skipped");
  });

  it("розпізнає недоступний tenant Supavisor (призупинений проєкт) як unreachable", async () => {
    const error = dbError("XX000", "Tenant or user not found");
    const { deps: d } = deps({ openDatabase: () => fakeDb({ ping: async () => Promise.reject(error) }) });
    expect((await runHealthChecks(d)).checks.database).toEqual({ status: "error", code: "unreachable" });
  });

  it("завершує перевірку БД за тайм-аутом як unreachable", async () => {
    const close = vi.fn();
    const { deps: d } = deps({ openDatabase: () => fakeDb({ ping: () => new Promise(() => {}), close }) });
    const started = Date.now();
    const report = await runHealthChecks(d);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(report.checks.database).toEqual({ status: "error", code: "unreachable" });
    expect(close).toHaveBeenCalled();
  });

  it("розрізняє доступну, але не ініціалізовану БД", async () => {
    const missingTable = deps({
      openDatabase: () => fakeDb({ isInitialized: async () => Promise.reject(dbError("42P01")) }),
    });
    const missingRow = deps({ openDatabase: () => fakeDb({ isInitialized: async () => false }) });
    for (const { deps: d } of [missingTable, missingRow]) {
      const report = await runHealthChecks(d);
      expect(report.checks.database).toEqual({ status: "ok" });
      expect(report.checks.schema).toEqual({ status: "error", code: "schema_not_initialized" });
    }
  });

  it.each([
    [401, "invalid_key"],
    [403, "invalid_key"],
    [500, "unreachable"],
    [540, "unreachable"],
    [404, "unknown"],
  ])("класифікує HTTP %i від Supabase API як %s", async (status, expected) => {
    const { deps: d } = deps({ fetch: vi.fn(async () => new Response("", { status })) });
    expect((await runHealthChecks(d)).checks.supabaseApi).toEqual({ status: "error", code: expected });
  });

  it("вважає мережеву помилку Supabase API недоступністю", async () => {
    const { deps: d } = deps({ fetch: vi.fn(async () => Promise.reject(new TypeError("fetch failed"))) });
    expect((await runHealthChecks(d)).checks.supabaseApi).toEqual({ status: "error", code: "unreachable" });
  });

  it("не розкриває деталей помилок у звіті, а в лозі маскує облікові дані", async () => {
    const error = dbError("28P01", `password authentication failed for ${env.POSTGRES_URL}`);
    const { deps: d, logs } = deps({ openDatabase: () => fakeDb({ ping: async () => Promise.reject(error) }) });
    const serialized = JSON.stringify(await runHealthChecks(d));
    expect(serialized).not.toMatch(/password|pw-Secret1|pooler|db-host/);
    expect(logs.join("\n")).toContain("28P01");
    expect(logs.join("\n")).not.toContain("pw-Secret1");
  });
});
