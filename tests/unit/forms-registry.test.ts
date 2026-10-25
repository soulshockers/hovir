import { describe, expect, it } from "vitest";

import { buildFormTree } from "@/lib/forms/schema";
import type { AnySlidePlugin } from "@/lib/plugins";
import { getRegistry } from "@/lib/plugins/registry";

import { editorSamplePlugin } from "../fixtures/plugins/editor-sample";

// Редактор генерує форму з configSchema кожного плагіна: схему, яку генератор не вміє показати, ловимо тут, а не в UI.

const all: AnySlidePlugin[] = [...getRegistry().all, editorSamplePlugin];

describe("генератор форм підтримує схеми всіх плагінів реєстру", () => {
  it.each(all.map((plugin) => [plugin.id, plugin] as const))("%s", (id, plugin) => {
    expect(() => {
      try {
        buildFormTree(plugin.configSchema, plugin.i18n.uk);
      } catch (error) {
        throw new Error(`Плагін "${id}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }).not.toThrow();
  });
});
