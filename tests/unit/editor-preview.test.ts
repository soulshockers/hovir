import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PreviewBoundary, SlideFrame } from "@/components/editor/SlidePreview";
import { previewCtx, previewState } from "@/lib/editor/preview";
import type { AnySlidePlugin } from "@/lib/plugins";

import { editorSamplePlugin } from "../fixtures/plugins/editor-sample";
import { guessPlugin } from "./plugin-fixtures";

describe("превʼю редактора", () => {
  it("previewCtx детермінований і без учасників", () => {
    const a = previewCtx(1000);
    const b = previewCtx(1000);
    const seqA = [a.random(), a.random(), a.random()];
    expect(seqA).toEqual([b.random(), b.random(), b.random()]);
    expect(seqA.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(a.now()).toBe(1000);
    expect(a.participants).toEqual([]);
  });

  it("стан — toPublic(init(config)) без секретів у публічній частині", () => {
    const state = previewState(guessPlugin, { min: 1, max: 10, durationSec: 5 }, previewCtx(0)) as Record<string, unknown>;
    expect(state).toMatchObject({ roundStatus: "idle", answer: null, guessCount: 0 });
    expect(state).not.toHaveProperty("secret");
  });

  it("кадр рендерить Presenter з конфігом і станом превʼю", () => {
    const html = renderToString(
      createElement(SlideFrame, { plugin: editorSamplePlugin, config: { ...editorSamplePlugin.defaultConfig, title: "Привіт", options: ["a", "b", "c"] }, openedAt: 0 }),
    );
    expect(html).toContain("Привіт");
    expect(html).toMatch(/data-testid="sample-option-count">3</);
    expect(html).toContain("inert");
  });

  it("виняток плагіна не пробивається за межі кадру", () => {
    const throwing: AnySlidePlugin = { ...editorSamplePlugin, server: { ...editorSamplePlugin.server, init: () => { throw new Error("init"); } } };
    expect(() => previewState(throwing, {}, previewCtx(0))).toThrow("init");

    expect(PreviewBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const boundary = new PreviewBoundary({ children: createElement("p", null, "ok"), resetKey: 1 });
    boundary.state = { failed: true, key: 1 };
    expect(renderToString(boundary.render() as ReactElement)).toContain("Превʼю недоступне");
    // Нова правка конфігу скидає помилку.
    expect(PreviewBoundary.getDerivedStateFromProps({ resetKey: 2 }, { failed: true, key: 1 })).toEqual({ failed: false, key: 2 });
  });
});
