import { z, type ZodType } from "zod";

// Мова повідомлень валідації форм редактора. Передається в кожну перевірку явно, без `z.config(...)`: глобальний
// config змінив би мову zod для всього процесу, зокрема серверного рендеру й API.

const ukErrors = z.locales.uk().localeError;

/** `safeParse` з українськими повідомленнями помилок (локаль редактора — до add-i18n). */
export function validateForm<T>(schema: ZodType<T>, value: unknown) {
  return schema.safeParse(value, { error: ukErrors });
}
