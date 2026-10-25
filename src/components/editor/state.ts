import type { EditorSlide } from "@/lib/editor/types";
import { validateForm } from "@/lib/forms/locale";
import { issuesByPath } from "@/lib/forms/schema";
import type { AnySlidePlugin } from "@/lib/plugins";

// Локальний стан слайда в редакторі: чернетка форми (може бути невалідною), останній валідний конфіг (для превʼю й
// збереження) і помилки полів.

export interface LocalSlide extends EditorSlide {
  draft: unknown;
  lastValid: unknown;
  errors: Record<string, string>;
}

export function toLocalSlide(slide: EditorSlide): LocalSlide {
  return { ...slide, draft: slide.config, lastValid: slide.config, errors: {} };
}

/** Нова чернетка: валідна — стає `lastValid`, невалідна — дає помилки полів і не зберігається. */
export function applyDraft(slide: LocalSlide, plugin: AnySlidePlugin, draft: unknown): { slide: LocalSlide; valid: boolean } {
  const parsed = validateForm(plugin.configSchema, draft);
  if (parsed.success) return { slide: { ...slide, draft, lastValid: parsed.data, errors: {} }, valid: true };
  return { slide: { ...slide, draft, errors: issuesByPath(parsed.error.issues) }, valid: false };
}

/** Порядок списку за `order` з сервера; невідомі id відкидаються. */
export function reorderById<T extends { id: string }>(items: T[], order: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return order.map((id) => byId.get(id)).filter((item): item is T => item !== undefined);
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
