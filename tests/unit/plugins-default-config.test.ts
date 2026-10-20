import { describe, expect, it } from "vitest";

import { getRegistry } from "@/lib/plugins/registry";

import { fixturePlugins } from "./plugin-fixtures";

// Для кожного плагіна з реєстру (і фікстурних) defaultConfig мусить проходити власну configSchema.

const all = [...getRegistry().all, ...fixturePlugins];

describe("defaultConfig проходить configSchema", () => {
  it.each(all.map((plugin) => [plugin.id, plugin] as const))("%s", (id, plugin) => {
    const result = plugin.configSchema.safeParse(plugin.defaultConfig);
    expect(result.success, `Плагін "${id}": defaultConfig не проходить configSchema`).toBe(true);
  });
});
