import type { PresentationAdminRepo } from "@/lib/admin/service";
import type { ServerEnv } from "@/lib/env/schema";
import type { PresentationRepo } from "@/lib/presentations/service";
import type { RateLimiter } from "@/lib/rate-limit/store";

/** Залежності API-обробників; у unit-тестах підставляються, як `HealthDeps` у `src/lib/health/checks.ts`. */
export interface ApiDeps {
  /** Типізована конфігурація або `ConfigError`. */
  getEnv(): ServerEnv;
  presentations(): PresentationRepo;
  admin(): PresentationAdminRepo;
  limiter(): RateLimiter;
  /** Робота з БД з дедлайном (див. `withDbDeadline`). */
  runDb<T>(work: () => Promise<T>): Promise<T>;
  now(): Date;
  log(message: string): void;
  /** Рядки підключення, які треба маскувати в логах. */
  connectionUrls(): string[];
}
