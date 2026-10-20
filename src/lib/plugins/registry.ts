import { plugins } from "@plugins/index";

import type { AnySlidePlugin } from "./contract";

export interface PluginRegistry {
  all: readonly AnySlidePlugin[];
  get(id: string): AnySlidePlugin | undefined;
}

/** Будує реєстр і падає, якщо `id` повторюється. */
export function createRegistry(list: readonly AnySlidePlugin[]): PluginRegistry {
  const byId = new Map<string, AnySlidePlugin>();
  for (const plugin of list) {
    if (byId.has(plugin.id)) throw new Error(`Плагін з id "${plugin.id}" зареєстровано двічі (plugins/index.ts)`);
    byId.set(plugin.id, plugin);
  }
  return { all: list, get: (id) => byId.get(id) };
}

let registry: PluginRegistry | undefined;

/** Реєстр з `plugins/index.ts`; унікальність `id` перевіряється при першому зверненні. */
export function getRegistry(): PluginRegistry {
  registry ??= createRegistry(plugins);
  return registry;
}

export function getPlugin(id: string): AnySlidePlugin | undefined {
  return getRegistry().get(id);
}
