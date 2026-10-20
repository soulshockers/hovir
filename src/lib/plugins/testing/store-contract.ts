import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { SlideKey, SlideStateStore } from "../store";

// Контрактний набір тестів порту `SlideStateStore`. Проганяється для пам'яті тут і для Postgres-реалізації в
// openspec/changes/add-live-sessions (інтеграційні тести з dev-базою). Кожен тест бере свіжі ключі.

const freshKey = (): SlideKey => ({ sessionId: randomUUID(), slideId: randomUUID() });
const pause = () => new Promise((resolve) => setTimeout(resolve, 1));

export function describeSlideStateStoreContract(name: string, makeStore: () => SlideStateStore | Promise<SlideStateStore>) {
  describe(`SlideStateStore: ${name}`, () => {
    it("нового слайда немає, записаний стан читається наступним викликом", async () => {
      const store = await makeStore();
      const key = freshKey();
      expect(await store.withSlideState(key, (current) => ({ result: current }))).toBeUndefined();
      await store.withSlideState(key, () => ({ result: null, state: { count: 1 } }));
      expect(await store.withSlideState(key, (current) => ({ result: current }))).toEqual({ count: 1 });
    });

    it("без state стан не змінюється", async () => {
      const store = await makeStore();
      const key = freshKey();
      await store.withSlideState(key, () => ({ result: null, state: { count: 1 } }));
      await store.withSlideState(key, () => ({ result: null }));
      expect(await store.withSlideState(key, (current) => ({ result: current }))).toEqual({ count: 1 });
    });

    it("50 паралельних інкрементів одного слайда дають 50", async () => {
      const store = await makeStore();
      const key = freshKey();
      await Promise.all(
        Array.from({ length: 50 }, () =>
          store.withSlideState(key, async (current) => {
            const count = ((current as { count: number } | undefined)?.count ?? 0) + 1;
            await pause();
            return { result: count, state: { count } };
          }),
        ),
      );
      expect(await store.withSlideState(key, (current) => ({ result: current }))).toEqual({ count: 50 });
    });

    it("помилка в fn не записує стан і не блокує наступні виклики", async () => {
      const store = await makeStore();
      const key = freshKey();
      await expect(
        store.withSlideState(key, () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(await store.withSlideState(key, (current) => ({ result: current }))).toBeUndefined();
    });

    it("різні слайди не чекають один одного", async () => {
      const store = await makeStore();
      const blocked = freshKey();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const slow = store.withSlideState(blocked, async () => {
        await gate;
        return { result: "slow" };
      });
      const other = { ...blocked, slideId: randomUUID() };
      await expect(store.withSlideState(other, () => ({ result: "fast" }))).resolves.toBe("fast");
      release();
      await expect(slow).resolves.toBe("slow");
    });
  });
}
