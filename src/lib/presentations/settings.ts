import { z } from "zod";

// Налаштування презентації в редакторі (openspec/specs/presentation-editor «Налаштування презентації»).
// Клієнтський модуль: та сама схема валідує форму і запит на сервері.

export const MAX_TITLE_LENGTH = 120;
export const THEME_PRESETS = ["light", "dark", "bright"] as const;
export const LISTENER_LOCALES = ["uk", "en", "auto"] as const;

export type ThemePreset = (typeof THEME_PRESETS)[number];
export type ListenerLocale = (typeof LISTENER_LOCALES)[number];

/** Назва в редакторі: обрізається, MUST мати 1–120 символів (порожня — помилка, а не «Нова презентація»). */
export const editorTitleSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, { message: "title_required" })
  .refine((value) => Array.from(value).length <= MAX_TITLE_LENGTH, { message: "title_too_long" });

export const themeSchema = z.object({
  preset: z.enum(THEME_PRESETS),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { message: "accent_invalid" })
    .optional(),
  /** URL логотипа в bucket цієї презентації; перевіряє сервер (`isOwnMediaUrl`). */
  logoUrl: z.string().max(1024).nullable().optional(),
});

export type Theme = z.infer<typeof themeSchema>;

export const settingsPatchSchema = z
  .object({
    title: editorTitleSchema.optional(),
    theme: themeSchema.optional(),
    locale: z.enum(LISTENER_LOCALES).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: "empty_patch" });

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export interface PresentationSettings {
  id: string;
  title: string;
  theme: Theme;
  locale: ListenerLocale;
  updatedAt: Date;
}

/** Повідомлення для полів форми налаштувань за кодами з `editorTitleSchema`/`themeSchema`. */
export const SETTINGS_MESSAGES: Record<string, string> = {
  title_required: "Назва не може бути порожньою.",
  title_too_long: `Назва має містити не більше ${MAX_TITLE_LENGTH} символів.`,
  accent_invalid: "Колір має бути у форматі #RRGGBB.",
};
