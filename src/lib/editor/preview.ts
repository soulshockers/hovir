import type { AnySlidePlugin, ServerCtx } from "@/lib/plugins";

// Превʼю редактора (openspec/specs/slide-plugin-contract «Превʼю редактора в браузері»):
// `init` і `toPublic` виконуються в браузері над конфігом автора з фіктивним контекстом без учасників. Стан превʼю
// ніде не зберігається; `handleAction`, `tick`, `toPlayer` і `scores` тут не викликаються.

/** Детермінований `ServerCtx`: фіксований час і повторюваний псевдовипадковий ряд (mulberry32). */
export function previewCtx(now: number, seed = 1): ServerCtx {
  let state = seed >>> 0;
  return {
    now: () => now,
    random: () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    participants: [],
    locale: "uk",
  };
}

/** Публічний стан для `Presenter` у превʼю; виняток плагіна прокидається (його ловить error boundary). */
export function previewState(plugin: Pick<AnySlidePlugin, "server">, config: unknown, ctx: ServerCtx): unknown {
  return plugin.server.toPublic(plugin.server.init(config, ctx));
}
