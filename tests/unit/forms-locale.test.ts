import { describe, expect, it } from "vitest";
import { z } from "zod";

import { applyDraft, toLocalSlide } from "@/components/editor/state";
import { validateForm } from "@/lib/forms/locale";

import { editorSamplePlugin } from "../fixtures/plugins/editor-sample";

describe("мова повідомлень валідації форм", () => {
  it("помилки форми — українською, а глобальний config zod не змінено", async () => {
    const before = z.config().localeError;
    // Модуль редактора раніше вмикав локаль глобально під час імпорту — тепер імпорт нічого не змінює.
    await import("@/components/editor/Editor");

    const result = validateForm(z.object({ size: z.number().int().max(10) }), { size: 42 });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toMatch(/Занадто велике/);

    expect(z.config().localeError).toBe(before);
    expect(z.number().max(10).safeParse(42).error!.issues[0].message).toMatch(/^Too big/);
  });

  it("помилки полів у чернетці слайда — українською", () => {
    const slide = toLocalSlide({ id: "s", pluginId: "editor-sample", pluginVersion: 1, status: "ok", config: editorSamplePlugin.defaultConfig });
    const { valid, slide: next } = applyDraft(slide, editorSamplePlugin, { ...editorSamplePlugin.defaultConfig, size: 42, title: "" });
    expect(valid).toBe(false);
    expect(next.errors.size).toMatch(/Занадто велике/);
    expect(next.errors.title).toMatch(/Занадто мале/);
  });
});
