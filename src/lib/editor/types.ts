import type { ListenerLocale, Theme } from "@/lib/presentations/settings";

// Дані редактора, що сервер передає клієнтському `Editor` (серіалізовні).

/**
 * Стан конфігу слайда після `resolveConfig`:
 * - `ok` — конфіг валідний для поточної версії плагіна;
 * - `migrated` — конфіг мігровано зі старої версії, його треба зберегти з поточною;
 * - `unknown_plugin` — плагіна немає в реєстрі: лише перемістити чи видалити;
 * - `invalid_config` / `no_migration` — конфіг не вдається використати, можна скинути до типових налаштувань;
 * - `newer_version` — записано новішою версією плагіна, лише для читання.
 */
export type SlideStatus = "ok" | "migrated" | "unknown_plugin" | "invalid_config" | "no_migration" | "newer_version";

export interface EditorSlide {
  id: string;
  pluginId: string;
  pluginVersion: number;
  status: SlideStatus;
  /** Розв'язаний конфіг для `ok`/`migrated`, інакше — збережений як є. */
  config: unknown;
  /** Пояснення для статусів з помилкою. */
  message?: string;
}

export interface EditorPresentation {
  id: string;
  title: string;
  createdAt: string;
  theme: Theme;
  locale: ListenerLocale;
}

export interface EditorData {
  presentation: EditorPresentation;
  slides: EditorSlide[];
  /** Час завантаження на сервері (мс): «зараз» для превʼю й ключ перемонтування після `router.refresh()`. */
  loadedAt: number;
}
