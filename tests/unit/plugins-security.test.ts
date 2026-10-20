import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { getRegistry } from "@/lib/plugins/registry";
import { checkPluginSecrets, type SecurityFixture } from "@/lib/plugins/testing";

// Тест-хелпер безпеки для кожного плагіна з plugins/index.ts. Фікстуру плагін кладе в plugins/<id>/security.fixture.ts;
// фікстура обов'язкова (плагін без секретів повертає `secretsOf: () => []`).

// Фікстури шукаються під час запуску (`readdirSync` + `import()`), а не `import.meta.glob`: результат glob потрапляє в
// персистентний кеш трансформацій Vitest і не бачить фікстур, доданих після першого запуску.
const pluginsDir = fileURLToPath(new URL("../../plugins/", import.meta.url));
const fixtures = new Map<string, SecurityFixture | undefined>();
for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
  const file = join(pluginsDir, entry.name, "security.fixture.ts");
  if (!entry.isDirectory() || !existsSync(file)) continue;
  const loaded: { securityFixture?: SecurityFixture } = await import(pathToFileURL(file).href);
  fixtures.set(entry.name, loaded.securityFixture);
}
const plugins = getRegistry().all;

describe("секрети плагінів не протікають до закриття раунду", () => {
  it("кожна фікстура належить плагіну з реєстру й експортує securityFixture", () => {
    for (const [id, fixture] of fixtures) {
      expect(plugins.some((plugin) => plugin.id === id), `plugins/${id}/security.fixture.ts без плагіна в реєстрі`).toBe(true);
      expect(fixture, `plugins/${id}/security.fixture.ts не експортує securityFixture`).toBeDefined();
    }
  });

  it.each(plugins.map((plugin) => [plugin.id, plugin] as const))("%s", (id, plugin) => {
    const fixture = fixtures.get(id);
    if (!fixture) throw new Error(`Плагін "${id}" не має фікстури безпеки plugins/${id}/security.fixture.ts`);
    checkPluginSecrets(plugin, fixture);
  });
});
