import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  buildFormTree,
  defaultValue,
  imageValues,
  issuesByPath,
  pluginFormTree,
  setIn,
  UnsupportedSchemaError,
  type FieldNode,
} from "@/lib/forms/schema";

import { editorSamplePlugin } from "../fixtures/plugins/editor-sample";

const field = (tree: { fields: FieldNode[] }, key: string) => tree.fields.find((f) => f.key === key)!;

describe("дерево форми editorSamplePlugin", () => {
  const tree = pluginFormTree(editorSamplePlugin);

  it("кожен віджет з межами й підписами зі словника", () => {
    expect(field(tree, "title")).toMatchObject({ kind: "text", widget: "text", label: "Заголовок", minLength: 1, maxLength: 80, nullable: false });
    expect(field(tree, "body")).toMatchObject({ kind: "text", widget: "markdown", maxLength: 2000 });
    expect(field(tree, "image")).toMatchObject({ kind: "text", widget: "image", nullable: true, label: "Зображення" });
    expect(field(tree, "accent")).toMatchObject({ kind: "text", widget: "color" });
    expect(field(tree, "size")).toMatchObject({ kind: "number", integer: true, min: 1, max: 10 });
    expect(field(tree, "visible")).toMatchObject({ kind: "boolean", label: "Показувати текст" });
    expect(field(tree, "layout")).toMatchObject({ kind: "enum", options: ["title", "split", "full"] });
    expect(field(tree, "options")).toMatchObject({ kind: "array", minItems: 2, maxItems: 6, item: { kind: "text", maxLength: 40, minLength: 1 } });
    expect(field(tree, "caption")).toMatchObject({ kind: "text", nullable: true, maxLength: 60 });
    const footer = field(tree, "footer");
    expect(footer).toMatchObject({ kind: "object", label: "Нижній колонтитул" });
    expect(footer.kind === "object" && footer.fields.map((f) => [f.key, f.label])).toEqual([
      ["text", "Текст колонтитула"],
      ["align", "Вирівнювання"],
    ]);
  });

  it("значення за замовчуванням для нових елементів проходять схему", () => {
    const value = defaultValue(tree);
    expect(editorSamplePlugin.configSchema.safeParse({ ...(value as object), title: "x", options: ["a", "b"] }).success).toBe(true);
  });

  it("знаходить значення полів-зображень", () => {
    expect(imageValues(tree, { ...editorSamplePlugin.defaultConfig, image: "https://x/y.png" })).toEqual(["https://x/y.png"]);
    expect(imageValues(tree, editorSamplePlugin.defaultConfig)).toEqual([]);
  });
});

describe("приклад з plugins/README.md", () => {
  // Той самий фрагмент, що й у розділі «Форма редактора» README.
  const configSchema = z.object({
    question: z.string().min(1).max(200).meta({ label: "field.question" }),
    details: z.string().max(2000).meta({ label: "field.details", widget: "markdown" }),
    image: z.string().nullable().meta({ label: "field.image", widget: "image" }),
    options: z.array(z.string().min(1).max(80)).min(2).max(8).meta({ label: "field.options" }),
    mode: z.enum(["single", "multiple"]).meta({ label: "field.mode" }),
  });

  it("дає задокументовані поля", () => {
    const tree = buildFormTree(configSchema, { "field.question": "Питання" });
    expect(tree.fields.map((f) => [f.key, f.kind, f.label])).toEqual([
      ["question", "text", "Питання"],
      ["details", "text", "field.details"],
      ["image", "text", "field.image"],
      ["options", "array", "field.options"],
      ["mode", "enum", "field.mode"],
    ]);
    expect(field(tree, "details")).toMatchObject({ widget: "markdown" });
    expect(field(tree, "image")).toMatchObject({ widget: "image", nullable: true });
  });
});

describe("непідтримувані конструкції", () => {
  it.each([
    ["transform", z.object({ when: z.string().transform(Number) }), "when"],
    ["record", z.object({ map: z.record(z.string(), z.string()) }), "map"],
    ["union", z.object({ either: z.union([z.string(), z.number()]) }), "either"],
    ["date", z.object({ nested: z.object({ at: z.date() }) }), "nested.at"],
  ])("%s → помилка з назвою поля", (_, schema, path) => {
    expect(() => buildFormTree(schema)).toThrow(UnsupportedSchemaError);
    expect(() => buildFormTree(schema)).toThrow(`"${path}"`);
  });

  it("конфіг не об'єкт", () => {
    expect(() => buildFormTree(z.string())).toThrow(UnsupportedSchemaError);
  });
});

describe("допоміжні функції", () => {
  it("issuesByPath бере перше повідомлення для шляху", () => {
    expect(issuesByPath([{ path: ["options", 1], message: "a" }, { path: ["options", 1], message: "b" }, { path: [], message: "c" }])).toEqual({
      "options.1": "a",
      "": "c",
    });
  });

  it("setIn оновлює незмінно й видаляє ключ для undefined", () => {
    const value = { a: { b: [1, 2] }, c: 1 };
    const next = setIn(value, ["a", "b", 1], 5);
    expect(next).toEqual({ a: { b: [1, 5] }, c: 1 });
    expect(value.a.b[1]).toBe(2);
    expect(setIn(value, ["c"], undefined)).toEqual({ a: { b: [1, 2] } });
  });
});
