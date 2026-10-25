import { z, type ZodType } from "zod";

import type { AnySlidePlugin } from "@/lib/plugins";

// Генератор форм з `configSchema` плагіна (openspec/changes/archive/2026-10-25-add-presentation-editor/design.md «Форма з zod-схеми»).
// Схема перетворюється на JSON Schema (`z.toJSONSchema`, вихідний тип), а з неї — на дерево полів. Внутрішніх
// структур zod не чіпаємо. Клієнтський модуль: дерево використовують і форма, і сервер (пошук полів-зображень).

export type Widget = "text" | "markdown" | "image" | "color";

interface BaseNode {
  /** Ключ у батьківському об'єкті; для елемента масиву — порожній рядок. */
  key: string;
  label: string;
  /** `.nullable()` — значення може бути `null`. */
  nullable: boolean;
  /** Поля немає в `required` — значення може бути відсутнім. */
  optional: boolean;
  default?: unknown;
}

export type FieldNode =
  | (BaseNode & { kind: "text"; widget: Widget; minLength?: number; maxLength?: number })
  | (BaseNode & { kind: "number"; integer: boolean; min?: number; max?: number })
  | (BaseNode & { kind: "boolean" })
  | (BaseNode & { kind: "enum"; options: (string | number)[] })
  | (BaseNode & { kind: "array"; item: FieldNode; minItems?: number; maxItems?: number })
  | (BaseNode & { kind: "object"; fields: FieldNode[] });

export type ObjectNode = Extract<FieldNode, { kind: "object" }>;

export type FieldPath = (string | number)[];

/** Схема містить конструкцію, яку форма не вміє показати. */
export class UnsupportedSchemaError extends Error {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`Поле "${path || "<корінь>"}": ${reason}`);
    this.name = "UnsupportedSchemaError";
  }
}

type Json = Record<string, unknown>;

const WIDGETS = new Set<Widget>(["markdown", "image", "color"]);
const META_KEYS = ["label", "widget", "default"] as const;

const isNullSchema = (node: unknown) => typeof node === "object" && node !== null && (node as Json).type === "null";
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER ? value : undefined);

/** Знімає `null` із `anyOf`/`type: [t, "null"]`; метадані обгортки (label, widget) переносить на внутрішню схему. */
function unwrapNullable(node: Json): { node: Json; nullable: boolean } {
  if (Array.isArray(node.anyOf)) {
    const options = node.anyOf as Json[];
    const rest = options.filter((option) => !isNullSchema(option));
    if (rest.length === 1 && options.length === 2) {
      const outer = Object.fromEntries(META_KEYS.filter((key) => key in node).map((key) => [key, node[key]]));
      return { node: { ...rest[0], ...outer }, nullable: true };
    }
    return { node, nullable: false };
  }
  if (Array.isArray(node.type) && node.type.includes("null")) {
    const types = (node.type as string[]).filter((type) => type !== "null");
    return { node: { ...node, type: types.length === 1 ? types[0] : types }, nullable: true };
  }
  return { node, nullable: false };
}

function convert(raw: Json, key: string, path: string, optional: boolean, label: (key: string, meta: unknown) => string): FieldNode {
  const { node, nullable } = unwrapNullable(raw);
  const base: BaseNode = { key, label: label(key, node.label), nullable, optional, ...("default" in node && { default: node.default }) };
  const fail = (reason: string): never => {
    throw new UnsupportedSchemaError(path, reason);
  };

  if ("$ref" in node) fail("рекурсивні схеми не підтримуються");
  if ("const" in node) return { ...base, kind: "enum", options: [node.const as string | number] };
  if (Array.isArray(node.enum)) {
    if (!node.enum.every((option) => typeof option === "string" || typeof option === "number")) fail("enum лише з рядків чи чисел");
    return { ...base, kind: "enum", options: node.enum as (string | number)[] };
  }

  switch (node.type) {
    case "string": {
      const widget = typeof node.widget === "string" && WIDGETS.has(node.widget as Widget) ? (node.widget as Widget) : "text";
      return { ...base, kind: "text", widget, minLength: num(node.minLength), maxLength: num(node.maxLength) };
    }
    case "integer":
    case "number": {
      const integer = node.type === "integer";
      const exclusiveMin = num(node.exclusiveMinimum);
      const exclusiveMax = num(node.exclusiveMaximum);
      const min = num(node.minimum) ?? (exclusiveMin === undefined ? undefined : integer ? exclusiveMin + 1 : exclusiveMin);
      const max = num(node.maximum) ?? (exclusiveMax === undefined ? undefined : integer ? exclusiveMax - 1 : exclusiveMax);
      return { ...base, kind: "number", integer, min, max };
    }
    case "boolean":
      return { ...base, kind: "boolean" };
    case "array": {
      if (typeof node.items !== "object" || node.items === null || Array.isArray(node.items) || "prefixItems" in node) fail("кортежі не підтримуються");
      const item = convert(node.items as Json, "", `${path}[]`, false, label);
      return { ...base, kind: "array", item, minItems: num(node.minItems), maxItems: num(node.maxItems) };
    }
    case "object": {
      if (typeof node.additionalProperties === "object" || "propertyNames" in node || "patternProperties" in node) {
        fail("record/словники не підтримуються");
      }
      const properties = (node.properties ?? {}) as Record<string, Json>;
      const required = new Set((node.required ?? []) as string[]);
      const fields = Object.entries(properties).map(([name, child]) =>
        convert(child, name, path ? `${path}.${name}` : name, !required.has(name), label),
      );
      return { ...base, kind: "object", fields };
    }
    default:
      return fail(Array.isArray(node.type) ? "union різних типів не підтримується" : "конструкція не має представлення у формі (transform, date, union тощо)");
  }
}

/**
 * Дерево полів для схеми конфігу. Підпис поля — `.meta({ label })` як ключ у словнику `i18n` (без перекладу — сам
 * ключ, без `label` — назва поля). Кидає `UnsupportedSchemaError` з шляхом поля.
 */
export function buildFormTree(schema: ZodType, dictionary: Record<string, string> = {}): ObjectNode {
  let json: Json;
  try {
    json = z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }) as Json;
  } catch (error) {
    throw new UnsupportedSchemaError("", error instanceof Error ? error.message : String(error));
  }
  const label = (key: string, meta: unknown) => (typeof meta === "string" ? (dictionary[meta] ?? meta) : key);
  const root = convert(json, "", "", false, label);
  if (root.kind !== "object") throw new UnsupportedSchemaError("", "конфіг має бути об'єктом");
  return root;
}

const trees = new WeakMap<object, ObjectNode>();

/** Дерево форми плагіна з підписами з його словника `uk` (локаль редактора — до add-i18n); кешується. */
export function pluginFormTree(plugin: Pick<AnySlidePlugin, "configSchema" | "i18n">): ObjectNode {
  let tree = trees.get(plugin.configSchema);
  if (!tree) {
    tree = buildFormTree(plugin.configSchema, plugin.i18n.uk);
    trees.set(plugin.configSchema, tree);
  }
  return tree;
}

/** Початкове значення для нового елемента масиву чи увімкненого nullable-поля. */
export function defaultValue(node: FieldNode): unknown {
  if (node.default !== undefined) return structuredClone(node.default);
  switch (node.kind) {
    case "text":
      return node.widget === "color" ? "#000000" : "";
    case "number":
      return node.min ?? 0;
    case "boolean":
      return false;
    case "enum":
      return node.options[0];
    case "array":
      return Array.from({ length: node.minItems ?? 0 }, () => defaultValue(node.item));
    case "object":
      return Object.fromEntries(node.fields.filter((field) => !field.optional).map((field) => [field.key, defaultValue(field)]));
  }
}

/** Усі непорожні значення полів-зображень у конфігу (для перевірки URL на сервері). */
export function imageValues(node: FieldNode, value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  switch (node.kind) {
    case "text":
      return node.widget === "image" && value !== "" ? [value] : [];
    case "array":
      return Array.isArray(value) ? value.flatMap((item) => imageValues(node.item, item)) : [];
    case "object":
      return typeof value === "object"
        ? node.fields.flatMap((field) => imageValues(field, (value as Record<string, unknown>)[field.key]))
        : [];
    default:
      return [];
  }
}

export const pathKey = (path: readonly PropertyKey[]) => path.map(String).join(".");

/** Перше повідомлення помилки для кожного шляху (`a.b.0`) з `issues` zod. */
export function issuesByPath(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) result[pathKey(issue.path)] ??= issue.message;
  return result;
}

/** Незмінне оновлення значення за шляхом; `undefined` видаляє ключ об'єкта. */
export function setIn(value: unknown, path: FieldPath, next: unknown): unknown {
  if (path.length === 0) return next;
  const [head, ...rest] = path;
  if (typeof head === "number") {
    const list = Array.isArray(value) ? [...value] : [];
    list[head] = setIn(list[head], rest, next);
    return list;
  }
  const object = { ...((typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>) };
  const updated = setIn(object[head], rest, next);
  if (updated === undefined) delete object[head];
  else object[head] = updated;
  return object;
}
