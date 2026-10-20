import type { EnvIssue } from "@/lib/env/common";

export const CHECK_NAMES = ["config", "database", "supabaseApi", "schema"] as const;
export type CheckName = (typeof CHECK_NAMES)[number];

export type CheckStatus = "ok" | "error" | "skipped";

export type HealthErrorCode =
  | "config_invalid"
  | "unreachable"
  | "auth_failed"
  | "invalid_key"
  | "schema_not_initialized"
  | "unknown";

export interface CheckResult {
  status: CheckStatus;
  /** Машинний код причини; лише для `error`. */
  code?: HealthErrorCode;
  /** Лише для `config`: назви проблемних змінних, без значень. */
  issues?: EnvIssue[];
}

export interface HealthReport {
  status: "ok" | "error";
  checkedAt: string;
  checks: Record<CheckName, CheckResult>;
}
