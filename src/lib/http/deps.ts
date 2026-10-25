import type { PresentationAdminRepo } from "@/lib/admin/service";
import type { ServerEnv } from "@/lib/env/schema";
import type { MediaStore } from "@/lib/media/store";
import type { PluginRegistry } from "@/lib/plugins/registry";
import type { PresentationRepo } from "@/lib/presentations/service";
import type { RateLimiter } from "@/lib/rate-limit/store";
import type { SlideRepo } from "@/lib/slides/service";

/** Залежності API-обробників; у unit-тестах підставляються, як `HealthDeps` у `src/lib/health/checks.ts`. */
export interface ApiDeps {
  /** Типізована конфігурація або `ConfigError`. */
  getEnv(): ServerEnv;
  presentations(): PresentationRepo;
  admin(): PresentationAdminRepo;
  limiter(): RateLimiter;
  slides(): SlideRepo;
  /** Файли презентацій у Supabase Storage. */
  media(): MediaStore;
  /** Реєстр плагінів; у тестах — фікстурні плагіни. */
  registry(): PluginRegistry;
  /** Робота з БД з дедлайном (див. `withDbDeadline`). */
  runDb<T>(work: () => Promise<T>): Promise<T>;
  now(): Date;
  log(message: string): void;
  /** Рядки підключення, які треба маскувати в логах. */
  connectionUrls(): string[];
}
