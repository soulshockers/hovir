import type { ComponentType } from "react";
import type { ZodType } from "zod";

import type { LOCALES } from "@/lib/env/schema";

// Контракт плагінів слайдів (openspec/changes/archive/2026-10-21-add-slide-plugin-system/design.md «Контракт»). Модуль залежить лише від zod,
// React і власних типів ядра, щоб згодом плагіни можна було винести в npm-пакети без зміни інтерфейсу.

export type Locale = (typeof LOCALES)[number];

/** Ключ у словнику `i18n` плагіна. */
export type I18nKey = string;

export type Actor = { kind: "presenter" } | { kind: "participant"; participantId: string };

export interface ParticipantInfo {
  participantId: string;
  nickname: string;
}

/** Подія для стрічки сесії (наприклад, «Олень вгадав число»), транслюється разом із `PublicState`. */
export interface FeedEvent {
  type: string;
  payload?: unknown;
}

export interface ActionResult<State> {
  state: State;
  /** Відповідь актору — лише в HTTP-відповіді, ніколи в каналі. */
  reply?: unknown;
  /** `false` — для цієї дії трансляції немає. За замовчуванням `true`. */
  broadcast?: boolean;
  events?: FeedEvent[];
}

export interface ServerCtx {
  now(): number;
  /** Криптографічно стійке число в `[0, 1)`. */
  random(): number;
  participants: readonly ParticipantInfo[];
  locale: Locale;
}

export interface PresenterControls<Action = unknown> {
  dispatch(action: Action): Promise<unknown>;
}

export interface SlidePlugin<Config, State, PublicState, PlayerView, Action> {
  id: string;
  /** Версія формату конфігу; зростає разом із `migrateConfig`. */
  version: number;
  meta: { title: I18nKey; icon: string; category: "content" | "poll" | "game" };
  /** `false` → слухач бачить «Дивіться на екран» замість `Audience`. */
  interactive: boolean;
  /** Чи нараховує очки в лідерборд. */
  scoring: boolean;

  // --- Редактор ---
  configSchema: ZodType<Config>;
  defaultConfig: Config;
  migrateConfig?(old: unknown, fromVersion: number): Config;

  // --- Сервер (виконується лише в API routes) ---
  server: {
    init(config: Config, ctx: ServerCtx): State;
    /** Чиста детермінована функція: час і випадковість — лише через `ctx`. */
    handleAction(state: State, action: Action, actor: Actor, ctx: ServerCtx): ActionResult<State>;
    validateAction: ZodType<Action>;
    /** Ліниве закриття раунду за таймером; `null` — стан не змінився. */
    tick?(state: State, ctx: ServerCtx): State | null;
    /** Те, що транслюється в канал. Без секретів до завершення раунду. */
    toPublic(state: State): PublicState;
    toPlayer(state: State, participantId: string): PlayerView;
    /** Очки за слайд по `participantId`, цілі в межах 0..1000. */
    scores?(state: State): Record<string, number>;
    exportRows?(state: State): Record<string, unknown>[];
  };

  // --- Клієнт ---
  Presenter: ComponentType<{ config: Config; state: PublicState; controls: PresenterControls<Action> }>;
  Audience: ComponentType<{ config: Config; state: PublicState; me: PlayerView; dispatch: (action: Action) => Promise<unknown> }>;
  Preview?: ComponentType<{ config: Config }>;
  i18n: Record<Locale, Record<I18nKey, string>>;
}

/** Тип-стерта форма для гетерогенного реєстру й рантайму ядра. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySlidePlugin = SlidePlugin<any, any, any, any, any>;

/** Оголошення плагіна: перевіряє маніфест проти контракту й зберігає точні типи всередині плагіна. */
export function defineSlidePlugin<Config, State, PublicState, PlayerView, Action>(
  plugin: SlidePlugin<Config, State, PublicState, PlayerView, Action>,
): SlidePlugin<Config, State, PublicState, PlayerView, Action> {
  return plugin;
}
