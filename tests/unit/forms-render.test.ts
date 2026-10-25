import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConfigForm } from "@/components/editor/ConfigForm";
import { issuesByPath, pluginFormTree } from "@/lib/forms/schema";

import { editorSamplePlugin } from "../fixtures/plugins/editor-sample";

const tree = pluginFormTree(editorSamplePlugin);
const render = (value: unknown, errors: Record<string, string> = {}) =>
  renderToStaticMarkup(createElement(ConfigForm, { tree, value, errors, onChange: () => {} }));

describe("форма editorSamplePlugin", () => {
  const html = render(editorSamplePlugin.defaultConfig);

  it("має поле для кожного ключа схеми з підписом зі словника", () => {
    for (const key of ["title", "body", "image", "accent", "size", "visible", "layout", "options", "caption", "footer", "footer.text", "footer.align"]) {
      expect(html).toContain(`data-field="${key}"`);
    }
    for (const label of ["Заголовок", "Текст", "Зображення", "Розмір", "Показувати текст", "Варіанти", "Нижній колонтитул"]) {
      expect(html).toContain(label);
    }
  });

  it("межі зі схеми стають атрибутами", () => {
    expect(html).toMatch(/id="field-title"[^>]*maxLength="80"|maxLength="80"[^>]*id="field-title"/);
    expect(html).toMatch(/<textarea[^>]*maxLength="2000"/);
    expect(html).toMatch(/type="number"[^>]*min="1"[^>]*max="10"/);
    expect(html).toContain('type="color"');
    const withImage = render({ ...editorSamplePlugin.defaultConfig, image: "https://abcd.supabase.co/x.png" });
    expect(withImage).toMatch(/type="file"[^>]*accept="image\/png,image\/jpeg,image\/webp,image\/gif"/);
    expect(withImage).toContain('src="https://abcd.supabase.co/x.png"');
  });

  it("enum: ≤ 4 варіанти — radio", () => {
    expect(html.match(/type="radio" name="field-layout"/g)).toHaveLength(3);
  });

  it("масив у межах minItems/maxItems: при мінімумі видалення недоступне", () => {
    expect(html.match(/aria-label="Видалити елемент \d"[^>]*disabled=""/g)).toHaveLength(2);
    const full = render({ ...editorSamplePlugin.defaultConfig, options: ["a", "b", "c", "d", "e", "f"] });
    expect(full).toMatch(/data-testid="field-options-add"[^>]*disabled=""/);
  });

  it("nullable з null показує лише перемикач «Без значення»", () => {
    expect(html).toMatch(/data-testid="field-caption-empty"[^>]*checked=""/);
    expect(html).not.toContain('id="field-caption"');
    expect(render({ ...editorSamplePlugin.defaultConfig, caption: "Підпис" })).toContain('id="field-caption"');
  });

  it("помилка схеми показується біля поля", () => {
    const value = { ...editorSamplePlugin.defaultConfig, size: 42 };
    const result = editorSamplePlugin.configSchema.safeParse(value);
    expect(result.success).toBe(false);
    const errors = issuesByPath(result.error!.issues);
    const withErrors = render(value, errors);
    expect(withErrors).toContain('id="field-size-error"');
    expect(withErrors).toMatch(/id="field-size"[^>]*aria-invalid="true"/);
  });
});
