import { createElement } from "react";
import { z } from "zod";

import { defineSlidePlugin } from "@/lib/plugins";
import type { SecurityFixture } from "@/lib/plugins/testing";

// Фікстурні плагіни для тестів ядра: «лічильник» без секретів і «вгадай число» із секретом, таймером, очками
// та міграцією конфігу v1 → v2.

const i18n = { uk: { title: "Фікстура" }, en: { title: "Fixture" } };

export const counterPlugin = defineSlidePlugin({
  id: "counter",
  version: 1,
  meta: { title: "title", icon: "plus", category: "poll" },
  interactive: true,
  scoring: false,
  configSchema: z.object({ step: z.number().int().positive() }),
  defaultConfig: { step: 1 },
  server: {
    init: () => ({ count: 0 }),
    handleAction: (state) => ({ state: { count: state.count + 1 }, reply: { ok: true } }),
    validateAction: z.object({ type: z.literal("inc") }),
    toPublic: (state) => ({ count: state.count }),
    toPlayer: () => ({}),
  },
  Presenter: ({ state }) => createElement("p", null, `Лічильник: ${state.count}`),
  Audience: ({ state }) => createElement("p", { "data-testid": "counter-audience" }, `Лічильник: ${state.count}`),
  i18n,
});

export interface GuessConfig {
  min: number;
  max: number;
  durationSec: number;
}

export interface GuessState {
  secret: number;
  durationMs: number;
  roundStatus: "idle" | "running" | "closed";
  endsAt: number | null;
  guesses: Record<string, number[]>;
  winners: string[];
}

const guessAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("guess"), value: z.number().int() }),
]);

export const guessPlugin = defineSlidePlugin({
  id: "guess-number",
  version: 2,
  meta: { title: "title", icon: "dice", category: "game" },
  interactive: true,
  scoring: true,
  configSchema: z
    .object({ min: z.number().int(), max: z.number().int(), durationSec: z.number().int().positive() })
    .refine((config) => config.min < config.max, { message: "min < max" }),
  defaultConfig: { min: 1, max: 100, durationSec: 20 },
  // v1: { range: number } — числа від 1 до range.
  migrateConfig: (old, fromVersion): GuessConfig => {
    if (fromVersion !== 1) throw new Error(`Немає міграції з версії ${fromVersion}`);
    const { range } = old as { range: number };
    return { min: 1, max: range, durationSec: 20 };
  },
  server: {
    init: (config: GuessConfig, ctx): GuessState => ({
      secret: config.min + Math.floor(ctx.random() * (config.max - config.min + 1)),
      durationMs: config.durationSec * 1000,
      roundStatus: "idle",
      endsAt: null,
      guesses: {},
      winners: [],
    }),
    handleAction: (state, action, actor, ctx) => {
      if (action.type === "start" && actor.kind === "presenter" && state.roundStatus === "idle") {
        return { state: { ...state, roundStatus: "running" as const, endsAt: ctx.now() + state.durationMs } };
      }
      if (action.type === "stop" && actor.kind === "presenter") {
        return { state: { ...state, roundStatus: "closed" as const } };
      }
      if (action.type === "guess" && actor.kind === "participant") {
        if (state.roundStatus !== "running") return { state, reply: { accepted: false }, broadcast: false };
        const id = actor.participantId;
        const guesses = { ...state.guesses, [id]: [...(state.guesses[id] ?? []), action.value] };
        const correct = action.value === state.secret;
        const winners = correct && !state.winners.includes(id) ? [...state.winners, id] : state.winners;
        const hint = correct ? "correct" : action.value < state.secret ? "higher" : "lower";
        return { state: { ...state, guesses, winners }, reply: { accepted: true, hint }, events: correct ? [{ type: "winner", payload: { id } }] : [] };
      }
      return { state, broadcast: false };
    },
    validateAction: guessAction,
    tick: (state, ctx) =>
      state.roundStatus === "running" && state.endsAt !== null && ctx.now() >= state.endsAt
        ? { ...state, roundStatus: "closed" as const }
        : null,
    toPublic: (state) => ({
      roundStatus: state.roundStatus,
      endsAt: state.endsAt,
      guessCount: Object.values(state.guesses).reduce((sum, list) => sum + list.length, 0),
      winners: state.winners,
      answer: state.roundStatus === "closed" ? state.secret : null,
    }),
    toPlayer: (state, participantId) => ({
      guesses: state.guesses[participantId] ?? [],
      won: state.winners.includes(participantId),
    }),
    scores: (state) =>
      Object.fromEntries(
        Object.keys(state.guesses).map((id) => {
          const place = state.winners.indexOf(id);
          return [id, place === -1 ? 0 : Math.max(100, 1000 - place * 100)];
        }),
      ),
  },
  Presenter: ({ state }) => createElement("p", null, `Спроб: ${state.guessCount}`),
  Audience: ({ me }) => createElement("p", null, `Мої спроби: ${me.guesses.join(", ")}`),
  i18n,
});

export const fixturePlugins = [counterPlugin, guessPlugin];

// Спроби у фікстурі не дорівнюють секрету: власна правильна спроба в `toPlayer` збігалася б із ним за значенням.
export const guessSecurityFixture: SecurityFixture<GuessConfig, GuessState> = {
  config: { min: 1, max: 100, durationSec: 20 },
  participants: [
    { participantId: "alice", nickname: "Лис" },
    { participantId: "bob", nickname: "Борсук" },
  ],
  randoms: [0.41],
  steps: [
    { actor: { kind: "presenter" }, action: { type: "start" } },
    { actor: { kind: "participant", participantId: "alice" }, action: { type: "guess", value: 10 } },
    { actor: { kind: "participant", participantId: "bob" }, action: { type: "guess", value: 50 } },
    { actor: { kind: "participant", participantId: "alice" }, action: { type: "guess", value: 77 }, advanceMs: 25_000 },
  ],
  secretsOf: (state) => [state.secret],
  isRoundClosed: (state) => state.roundStatus === "closed",
};
