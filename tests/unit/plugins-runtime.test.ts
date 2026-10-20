import { describe, expect, it, vi } from "vitest";

import { ActionValidationError, collectScores, ensureSlideState, runAction, runTick, type SlideRef } from "@/lib/plugins/runtime";
import { memorySlideStateStore } from "@/lib/plugins/store";
import { fakeCtx } from "@/lib/plugins/testing";

import { counterPlugin, guessPlugin, type GuessState } from "./plugin-fixtures";

const presenter = { kind: "presenter" } as const;
const alice = { kind: "participant", participantId: "alice" } as const;
const bob = { kind: "participant", participantId: "bob" } as const;

const key = { sessionId: "s1", slideId: "slide-1" };
// random 0.41 → secret = 1 + floor(0.41 * 100) = 42
const guessSlide: SlideRef = { plugin: guessPlugin, config: guessPlugin.defaultConfig, key };
const counterSlide: SlideRef = { plugin: counterPlugin, config: counterPlugin.defaultConfig, key };

describe("ensureSlideState", () => {
  it("init лише при першому показі; повернення до слайда продовжує попередній стан", async () => {
    const store = memorySlideStateStore();
    const init = vi.fn(counterPlugin.server.init);
    const slide = { ...counterSlide, plugin: { ...counterPlugin, server: { ...counterPlugin.server, init } } };
    const ctx = fakeCtx();

    expect(await ensureSlideState(store, slide, ctx)).toEqual({ count: 0 });
    await runAction(store, slide, { type: "inc" }, alice, ctx);
    expect(await ensureSlideState(store, slide, ctx)).toEqual({ count: 1 });
    expect(init).toHaveBeenCalledTimes(1);
  });
});

describe("runAction", () => {
  it("невалідна дія відхиляється без виклику handleAction", async () => {
    const handleAction = vi.fn(counterPlugin.server.handleAction);
    const slide = { ...counterSlide, plugin: { ...counterPlugin, server: { ...counterPlugin.server, handleAction } } };
    await expect(runAction(memorySlideStateStore(), slide, { type: "dec" }, alice, fakeCtx())).rejects.toBeInstanceOf(
      ActionValidationError,
    );
    expect(handleAction).not.toHaveBeenCalled();
  });

  it("відповідь актору й PlayerView — у результаті; публічний стан містить endsAt", async () => {
    const store = memorySlideStateStore();
    const ctx = fakeCtx({ now: 10_000, randoms: [0.41] });
    const started = await runAction(store, guessSlide, { type: "start" }, presenter, ctx);
    expect(started.publicState).toMatchObject({ roundStatus: "running", endsAt: 30_000 });
    expect(started.playerView).toBeUndefined();

    const guess = await runAction(store, guessSlide, { type: "guess", value: 50 }, alice, ctx);
    expect(guess.reply).toEqual({ accepted: true, hint: "lower" });
    expect(guess.playerView).toEqual({ guesses: [50], won: false });
    expect(guess.broadcast).toBe(true);
  });

  it("дія після endsAt: спершу tick закриває раунд, відповідь не зараховується, broadcast: false прокидається", async () => {
    const store = memorySlideStateStore();
    const ctx = fakeCtx({ randoms: [0.41] });
    await runAction(store, guessSlide, { type: "start" }, presenter, ctx);
    ctx.advance(20_000);

    const late = await runAction(store, guessSlide, { type: "guess", value: 42 }, alice, ctx);
    expect(late.ticked).toBe(true);
    expect(late.reply).toEqual({ accepted: false });
    expect(late.broadcast).toBe(false);
    expect(late.publicState).toMatchObject({ roundStatus: "closed", guessCount: 0, answer: 42 });
  });

  it("дві паралельні дії на той самий слайд обидві відображені в стані", async () => {
    const store = memorySlideStateStore();
    const ctx = fakeCtx({ randoms: [0.41] });
    await runAction(store, guessSlide, { type: "start" }, presenter, ctx);
    await Promise.all([
      runAction(store, guessSlide, { type: "guess", value: 10 }, alice, ctx),
      runAction(store, guessSlide, { type: "guess", value: 42 }, bob, ctx),
    ]);
    const state = (await ensureSlideState(store, guessSlide, ctx)) as GuessState;
    expect(state.guesses).toEqual({ alice: [10], bob: [42] });
    expect(state.winners).toEqual(["bob"]);
  });

  it("детермінований: той самий вхід і ctx дають той самий результат", async () => {
    const run = async () => {
      const store = memorySlideStateStore();
      const ctx = fakeCtx({ now: 5, randoms: [0.41] });
      await runAction(store, guessSlide, { type: "start" }, presenter, ctx);
      return runAction(store, guessSlide, { type: "guess", value: 42 }, alice, ctx);
    };
    expect(await run()).toEqual(await run());
  });
});

describe("runTick", () => {
  it("таймер сплив без дій: tick доповідача закриває раунд", async () => {
    const store = memorySlideStateStore();
    const ctx = fakeCtx({ randoms: [0.41] });
    await runAction(store, guessSlide, { type: "start" }, presenter, ctx);

    expect(await runTick(store, guessSlide, ctx)).toMatchObject({ ticked: false, publicState: { roundStatus: "running" } });
    ctx.advance(20_000);
    expect(await runTick(store, guessSlide, ctx)).toMatchObject({ ticked: true, publicState: { roundStatus: "closed" } });
    expect(await runTick(store, guessSlide, ctx, alice)).toMatchObject({ ticked: false, playerView: { guesses: [] } });
  });

  it("плагін без tick: стан не змінюється", async () => {
    const store = memorySlideStateStore();
    expect(await runTick(store, counterSlide, fakeCtx())).toEqual({ ticked: false, publicState: { count: 0 } });
  });
});

describe("collectScores", () => {
  const closed: GuessState = {
    secret: 42,
    durationMs: 20_000,
    roundStatus: "closed",
    endsAt: 0,
    guesses: { alice: [42], bob: [1], carol: [42] },
    winners: ["alice", "carol"],
  };

  it("очки ігрового плагіна в межах 0..1000", () => {
    expect(collectScores(guessPlugin, closed)).toEqual({ alice: 1000, bob: 0, carol: 900 });
  });

  it("scoring: false не нараховує очок", () => {
    expect(collectScores({ ...guessPlugin, scoring: false }, closed)).toEqual({});
    expect(collectScores(counterPlugin, { count: 3 })).toEqual({});
  });

  it("нецілі або поза 0..1000 — помилка з id плагіна", () => {
    const broken = (value: number) => ({ ...guessPlugin, server: { ...guessPlugin.server, scores: () => ({ alice: value }) } });
    expect(() => collectScores(broken(1001), closed)).toThrow(/"guess-number"/);
    expect(() => collectScores(broken(-1), closed)).toThrow(/"guess-number"/);
    expect(() => collectScores(broken(10.5), closed)).toThrow(/"guess-number"/);
  });
});
