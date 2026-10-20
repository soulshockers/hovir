import type { Actor, AnySlidePlugin, FeedEvent, ServerCtx } from "./contract";
import type { ConfigIssue } from "./config";
import type { SlideKey, SlideStateStore } from "./store";

// Рантайм ядра: як сесія виконує плагін (openspec/specs/slide-plugin-runtime/spec.md).
// Чисті кроки над портом `SlideStateStore`; HTTP, токени, rate limiting і публікацію в канал додає add-live-sessions.

/** Слайд у сесії: плагін, уже розв'язаний конфіг (`resolveConfig`) і ключ стану. */
export interface SlideRef {
  plugin: AnySlidePlugin;
  config: unknown;
  key: SlideKey;
}

export interface SlideView {
  publicState: unknown;
  /** Лише для актора-учасника; повертається в HTTP-відповіді, не в каналі. */
  playerView?: unknown;
}

export interface ActionOutcome extends SlideView {
  reply: unknown;
  /** `false` — трансляції для цієї дії немає (`ActionResult.broadcast`). */
  broadcast: boolean;
  events: FeedEvent[];
  /** Перед дією `tick` закрив раунд за таймером — це окрема зміна публічного стану. */
  ticked: boolean;
}

export class ActionValidationError extends Error {
  constructor(
    readonly pluginId: string,
    readonly issues: ConfigIssue[],
  ) {
    super(`Плагін "${pluginId}": дія не проходить validateAction`);
    this.name = "ActionValidationError";
  }
}

/** Стан слайда: `init` лише при першому показі в сесії, далі — збережений. */
export function ensureSlideState(store: SlideStateStore, slide: SlideRef, ctx: ServerCtx): Promise<unknown> {
  return store.withSlideState(slide.key, (current) => {
    if (current !== undefined) return { result: current };
    const state = slide.plugin.server.init(slide.config, ctx);
    return { result: state, state };
  });
}

/** Лінивий `tick` (запит стану, `tick` доповідацького клієнта): закриває раунд, якщо таймер сплив. */
export function runTick(
  store: SlideStateStore,
  slide: SlideRef,
  ctx: ServerCtx,
  actor?: Actor,
): Promise<SlideView & { ticked: boolean }> {
  return store.withSlideState(slide.key, (current) => {
    const { state, created, ticked } = advance(slide, current, ctx);
    const result = { ...view(slide.plugin, state, actor), ticked };
    return created || ticked ? { result, state } : { result };
  });
}

/**
 * Дія учасника чи доповідача: `validateAction` (невалідна дія не доходить до плагіна), далі в серіалізованій секції
 * `tick` → `handleAction` → збереження. Дія після `endsAt` бачить уже закритий раунд.
 */
export async function runAction(
  store: SlideStateStore,
  slide: SlideRef,
  rawAction: unknown,
  actor: Actor,
  ctx: ServerCtx,
): Promise<ActionOutcome> {
  const { plugin } = slide;
  const parsed = plugin.server.validateAction.safeParse(rawAction);
  if (!parsed.success) {
    throw new ActionValidationError(
      plugin.id,
      parsed.error.issues.map(({ path, message }) => ({ path, message })),
    );
  }

  return store.withSlideState(slide.key, (current) => {
    const { state, ticked } = advance(slide, current, ctx);
    const outcome = plugin.server.handleAction(state, parsed.data, actor, ctx);
    return {
      state: outcome.state,
      result: {
        ...view(plugin, outcome.state, actor),
        reply: outcome.reply,
        broadcast: outcome.broadcast ?? true,
        events: outcome.events ?? [],
        ticked,
      },
    };
  });
}

/** Очки за слайд для лідерборду: `{}` для `scoring: false`; значення мусять бути цілими 0..1000. */
export function collectScores(plugin: AnySlidePlugin, state: unknown): Record<string, number> {
  if (!plugin.scoring || !plugin.server.scores) return {};
  const scores: Record<string, number> = plugin.server.scores(state);
  for (const [participantId, value] of Object.entries(scores)) {
    if (!Number.isInteger(value) || value < 0 || value > 1000) {
      throw new Error(`Плагін "${plugin.id}": очки ${value} для ${participantId} поза цілими 0..1000`);
    }
  }
  return scores;
}

function advance(slide: SlideRef, current: unknown, ctx: ServerCtx) {
  const created = current === undefined;
  const state = created ? slide.plugin.server.init(slide.config, ctx) : current;
  const next = slide.plugin.server.tick?.(state, ctx) ?? null;
  return next === null ? { state, created, ticked: false } : { state: next, created, ticked: true };
}

function view(plugin: AnySlidePlugin, state: unknown, actor?: Actor): SlideView {
  const publicState = plugin.server.toPublic(state);
  return actor?.kind === "participant"
    ? { publicState, playerView: plugin.server.toPlayer(state, actor.participantId) }
    : { publicState };
}
