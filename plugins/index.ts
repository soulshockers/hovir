import type { AnySlidePlugin } from "@/lib/plugins";

// Реєстр плагінів слайдів (openspec/changes/archive/2026-10-21-add-slide-plugin-system/design.md). Новий плагін — папка `plugins/<id>/`
// і рядок у цьому масиві; `id` мають бути унікальними (перевіряє `@/lib/plugins/registry`).
export const plugins: readonly AnySlidePlugin[] = [];
