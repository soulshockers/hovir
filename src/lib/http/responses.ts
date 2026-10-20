import { classifyDbError } from "@/lib/db/errors";
import { maskConnectionDetails } from "@/lib/db/mask";
import { ConfigError } from "@/lib/env/common";

// Єдиний формат JSON-помилок API: `{ error: { code } }` — машинний код без деталей реалізації.

export type ApiErrorCode =
  | "validation_failed"
  | "password_required"
  | "invalid_password"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "service_unavailable"
  | "internal_error";

export function jsonError(status: number, code: ApiErrorCode, headers?: HeadersInit): Response {
  return Response.json({ error: { code } }, { status, headers });
}

export const notFound = () => jsonError(404, "not_found");

/** 429 з `Retry-After` — цілим додатним числом секунд до звільнення ліміту. */
export function rateLimited(retryAfterSeconds: number): Response {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return jsonError(429, "rate_limited", { "Retry-After": String(seconds) });
}

const UNAVAILABLE_DB_CODES = new Set(["unreachable", "auth_failed", "schema_not_initialized"]);

/** Чи означає помилка недоступну конфігурацію або БД (→ 503). */
export function isServiceUnavailable(error: unknown): boolean {
  return error instanceof ConfigError || UNAVAILABLE_DB_CODES.has(classifyDbError(error));
}

/**
 * Неочікувана помилка обробника → 503 `service_unavailable` (конфігурація чи БД) або 500 `internal_error`.
 * У лог іде лише замаскований опис, без рядків підключення; токени й паролі в помилки не потрапляють.
 */
export function errorResponse(error: unknown, log: (message: string) => void, urls: string[] = []): Response {
  if (error instanceof ConfigError) {
    log(`[api] конфігурація: ${error.variables.join(", ")}`);
    return jsonError(503, "service_unavailable");
  }
  const code = classifyDbError(error);
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  log(`[api] помилка (${code}): ${maskConnectionDetails(detail, urls)}`);
  return UNAVAILABLE_DB_CODES.has(code) ? jsonError(503, "service_unavailable") : jsonError(500, "internal_error");
}
