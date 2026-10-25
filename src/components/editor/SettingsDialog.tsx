"use client";

import { LISTENER_LOCALES, SETTINGS_MESSAGES, THEME_PRESETS, type ListenerLocale, type Theme } from "@/lib/presentations/settings";

import { ImageInput, type UploadImage } from "./ConfigForm";
import { Dialog } from "./Dialog";

export interface SettingsDraft {
  title: string;
  theme: Theme;
  locale: ListenerLocale;
}

const PRESET_LABEL: Record<Theme["preset"], string> = { light: "Світла", dark: "Темна", bright: "Яскрава" };
const LOCALE_LABEL: Record<ListenerLocale, string> = { uk: "Українська", en: "English", auto: "Автоматично (мова пристрою)" };

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm aria-[invalid=true]:border-red-500";

/** Налаштування презентації: назва, тема (пресет, акцент, логотип), мова інтерфейсу слухачів. Зберігаються автоматично. */
export function SettingsDialog({
  draft,
  titleError,
  onChange,
  uploadImage,
  onClose,
}: {
  draft: SettingsDraft;
  titleError: string | null;
  onChange: (next: SettingsDraft) => void;
  uploadImage: UploadImage;
  onClose: () => void;
}) {
  const setTheme = (theme: Partial<Theme>) => onChange({ ...draft, theme: { ...draft.theme, ...theme } });

  return (
    <Dialog title="Налаштування презентації" onClose={onClose} testId="settings-dialog">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <label htmlFor="settings-title" className="text-sm font-medium">
            Назва
          </label>
          <input
            id="settings-title"
            data-testid="settings-title"
            className={inputClass}
            value={draft.title}
            aria-invalid={titleError !== null}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
          />
          {titleError && (
            <p role="alert" className="text-xs text-red-700" data-testid="settings-title-error">
              {SETTINGS_MESSAGES[titleError] ?? titleError}
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Тема</legend>
          <div className="flex gap-4">
            {THEME_PRESETS.map((preset) => (
              <label key={preset} className="flex items-center gap-1 text-sm">
                <input type="radio" name="theme-preset" value={preset} checked={draft.theme.preset === preset} onChange={() => setTheme({ preset })} />
                {PRESET_LABEL[preset]}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="settings-accent-enabled"
              checked={draft.theme.accent !== undefined}
              onChange={(event) => setTheme({ accent: event.target.checked ? "#3366ff" : undefined })}
            />
            Власний колір акценту
          </label>
          {draft.theme.accent !== undefined && (
            <input type="color" aria-label="Колір акценту" value={draft.theme.accent} onChange={(event) => setTheme({ accent: event.target.value })} />
          )}
          <span className="text-sm">Логотип</span>
          <ImageInput id="settings-logo" data-testid="settings-logo" value={draft.theme.logoUrl ?? ""} onChange={(url) => setTheme({ logoUrl: url })} uploadImage={uploadImage} />
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor="settings-locale" className="text-sm font-medium">
            Мова інтерфейсу слухачів
          </label>
          <select
            id="settings-locale"
            data-testid="settings-locale"
            className={inputClass}
            value={draft.locale}
            onChange={(event) => onChange({ ...draft, locale: event.target.value as ListenerLocale })}
          >
            {LISTENER_LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {LOCALE_LABEL[locale]}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500">Тема й мова застосуються на екранах доповідача й слухачів у наступних версіях.</p>
      </div>
    </Dialog>
  );
}
