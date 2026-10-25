import { describe, expect, it } from "vitest";

import { createRegistry } from "@/lib/plugins/registry";
import {
  createSlide,
  deleteSlide,
  duplicateSlide,
  MAX_SLIDES,
  reorderSlides,
  saveSlideConfig,
  type SlideRecord,
} from "@/lib/slides/service";

import { editorSamplePlugin } from "../fixtures/plugins/editor-sample";
import { memorySlides } from "./fakes";
import { counterPlugin, guessPlugin } from "./plugin-fixtures";

const P = "11111111-1111-4111-8111-111111111111";
const registry = createRegistry([counterPlugin, guessPlugin, editorSamplePlugin]);

const value = <T>(result: { ok: true; value: T } | { ok: false; code: string }): T => {
  if (!result.ok) throw new Error(`очікувався успіх, отримано ${result.code}`);
  return result.value;
};
const positions = (rows: SlideRecord[]) => rows.map((row) => row.position);

async function withSlides(count: number) {
  const store = memorySlides();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) ids.push(value(await createSlide(store.repo, registry, P, { pluginId: "counter" })).slide.id);
  return { ...store, ids };
}

describe("створення слайда", () => {
  it("отримує defaultConfig і поточну версію плагіна, стає в кінець", async () => {
    const { repo } = memorySlides();
    const first = value(await createSlide(repo, registry, P, { pluginId: "guess-number" }));
    expect(first.slide).toMatchObject({ pluginId: "guess-number", pluginVersion: 2, config: guessPlugin.defaultConfig, position: 0 });
    const second = value(await createSlide(repo, registry, P, { pluginId: "counter" }));
    expect(second.order).toEqual([first.slide.id, second.slide.id]);
  });

  it("стає після вибраного слайда, позиції лишаються 0..n−1", async () => {
    const { repo, ids } = await withSlides(3);
    const added = value(await createSlide(repo, registry, P, { pluginId: "editor-sample", afterSlideId: ids[0] }));
    expect(added.order).toEqual([ids[0], added.slide.id, ids[1], ids[2]]);
    const list = await repo.list(P);
    expect(list.map((s) => s.id)).toEqual(added.order);
    expect(positions(list)).toEqual([0, 1, 2, 3]);
  });

  it("невідомий тип — unknown_plugin", async () => {
    const { repo, rows } = memorySlides();
    expect(await createSlide(repo, registry, P, { pluginId: "poll" })).toEqual({ ok: false, code: "unknown_plugin" });
    expect(rows).toHaveLength(0);
  });

  it(`не більше ${MAX_SLIDES} слайдів`, async () => {
    const { repo } = await withSlides(MAX_SLIDES);
    expect(await createSlide(repo, registry, P, { pluginId: "counter" })).toEqual({ ok: false, code: "validation_failed" });
  });
});

describe("дублювання, видалення, перестановка", () => {
  it("копія з тим самим конфігом одразу після оригіналу", async () => {
    const { repo, ids } = await withSlides(2);
    value(await saveSlideConfig(repo, registry, P, ids[0], { step: 5 }));
    const copy = value(await duplicateSlide(repo, P, ids[0]));
    expect(copy.order).toEqual([ids[0], copy.slide.id, ids[1]]);
    expect(copy.slide.config).toEqual({ step: 5 });
    expect(await duplicateSlide(repo, P, "22222222-2222-4222-8222-222222222222")).toEqual({ ok: false, code: "not_found" });
  });

  it("видалення перенумеровує позиції", async () => {
    const { repo, ids } = await withSlides(3);
    expect(value(await deleteSlide(repo, P, ids[1]))).toEqual([ids[0], ids[2]]);
    expect(positions(await repo.list(P))).toEqual([0, 1]);
    expect(await deleteSlide(repo, P, ids[1])).toEqual({ ok: false, code: "not_found" });
  });

  it("третій на перше місце, відносний порядок решти зберігається", async () => {
    const { repo, ids } = await withSlides(4);
    value(await reorderSlides(repo, P, [ids[2], ids[0], ids[1], ids[3]]));
    expect((await repo.list(P)).map((s) => s.id)).toEqual([ids[2], ids[0], ids[1], ids[3]]);
  });

  it("неповний, задублений чи чужий список — conflict без змін", async () => {
    const { repo, ids } = await withSlides(3);
    for (const order of [[ids[0], ids[1]], [ids[0], ids[0], ids[1]], [ids[0], ids[1], "33333333-3333-4333-8333-333333333333"]]) {
      expect(await reorderSlides(repo, P, order)).toEqual({ ok: false, code: "conflict" });
    }
    expect((await repo.list(P)).map((s) => s.id)).toEqual(ids);
  });

  it("паралельні мутації лишають позиції послідовними", async () => {
    const { repo, ids } = await withSlides(5);
    await Promise.all([
      createSlide(repo, registry, P, { pluginId: "counter", afterSlideId: ids[1] }),
      deleteSlide(repo, P, ids[3]),
      duplicateSlide(repo, P, ids[0]),
      createSlide(repo, registry, P, { pluginId: "counter" }),
    ]);
    const list = await repo.list(P);
    expect(positions(list)).toEqual(list.map((_, i) => i));
  });
});

describe("збереження конфігу", () => {
  it("валідує поточною схемою і пише поточну версію плагіна", async () => {
    const { repo, rows } = memorySlides();
    rows.push({ id: "s1", presentationId: P, position: 0, pluginId: "guess-number", pluginVersion: 1, config: { range: 50 }, updatedAt: new Date() });
    const saved = value(await saveSlideConfig(repo, registry, P, "s1", { min: 1, max: 50, durationSec: 20 }));
    expect(saved).toMatchObject({ pluginVersion: 2, config: { min: 1, max: 50, durationSec: 20 } });
  });

  it("конфіг поза схемою чи понад 64 КБ — validation_failed, дані не змінено", async () => {
    const { repo, ids, rows } = await withSlides(1);
    expect(await saveSlideConfig(repo, registry, P, ids[0], { step: -1 })).toEqual({ ok: false, code: "validation_failed" });
    expect(await saveSlideConfig(repo, registry, P, ids[0], { step: 1, pad: "x".repeat(70_000) })).toEqual({ ok: false, code: "validation_failed" });
    expect(rows[0].config).toEqual({ step: 1 });
  });

  it("перевірка ядра поверх схеми", async () => {
    const { repo, ids } = await withSlides(1);
    expect(await saveSlideConfig(repo, registry, P, ids[0], { step: 2 }, () => false)).toEqual({ ok: false, code: "validation_failed" });
  });

  it("слайд новішої версії чи невідомого плагіна — slide_locked", async () => {
    const { repo, rows } = memorySlides();
    rows.push(
      { id: "new", presentationId: P, position: 0, pluginId: "counter", pluginVersion: 7, config: { step: 1 }, updatedAt: new Date() },
      { id: "gone", presentationId: P, position: 1, pluginId: "removed", pluginVersion: 1, config: { x: 1 }, updatedAt: new Date() },
    );
    expect(await saveSlideConfig(repo, registry, P, "new", { step: 2 })).toEqual({ ok: false, code: "slide_locked" });
    expect(await saveSlideConfig(repo, registry, P, "gone", { x: 2 })).toEqual({ ok: false, code: "slide_locked" });
    expect(rows.map((r) => r.config)).toEqual([{ step: 1 }, { x: 1 }]);
  });

  it("слайд іншої презентації — not_found", async () => {
    const { repo, ids } = await withSlides(1);
    expect(await saveSlideConfig(repo, registry, "99999999-9999-4999-8999-999999999999", ids[0], { step: 2 })).toEqual({ ok: false, code: "not_found" });
  });
});
