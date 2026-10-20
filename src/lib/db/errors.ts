// Класифікація помилок підключення до Postgres. Спільна для скрипта міграцій і перевірок стану.

export type DbErrorCode = "unreachable" | "auth_failed" | "schema_not_initialized" | "unknown";

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  // коди postgres.js
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
]);

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label}: тайм-аут ${ms} мс`);
    this.name = "TimeoutError";
  }
}

export function classifyDbError(error: unknown): DbErrorCode {
  if (error instanceof TimeoutError) return "unreachable";
  if (typeof error !== "object" || error === null) return "unknown";

  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string") {
    if (NETWORK_CODES.has(code)) return "unreachable";
    if (code === "28P01" || code === "28000") return "auth_failed";
    if (code === "42P01") return "schema_not_initialized";
  }
  // Supavisor відповідає так, коли проєкт (tenant) недоступний, зокрема призупинений.
  if (typeof message === "string" && /tenant or user not found/i.test(message)) return "unreachable";
  return "unknown";
}
