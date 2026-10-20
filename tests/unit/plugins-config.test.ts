import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "@/lib/plugins/config";

import { counterPlugin, guessPlugin } from "./plugin-fixtures";

describe("resolveConfig", () => {
  it("мігрує конфіг v1 → v2 і валідує результат", () => {
    expect(resolveConfig(guessPlugin, { range: 10 }, 1)).toEqual({ ok: true, config: { min: 1, max: 10, durationSec: 20 } });
  });

  it("результат міграції, що не проходить схему, — invalid_config", () => {
    const result = resolveConfig(guessPlugin, { range: 0 }, 1);
    expect(result).toMatchObject({ ok: false, reason: "invalid_config" });
  });

  it("невалідний конфіг поточної версії — ok: false з issues", () => {
    const result = resolveConfig(counterPlugin, { step: -1 }, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].path).toEqual(["step"]);
  });

  it("поточна версія не викликає migrateConfig", () => {
    const migrateConfig = vi.fn();
    const plugin = { ...guessPlugin, migrateConfig };
    expect(resolveConfig(plugin, { min: 1, max: 5, durationSec: 10 }, 2)).toMatchObject({ ok: true });
    expect(migrateConfig).not.toHaveBeenCalled();
  });

  it("старша версія без migrateConfig — no_migration", () => {
    const plugin = { ...counterPlugin, version: 2 };
    expect(resolveConfig(plugin, { step: 1 }, 1)).toMatchObject({ ok: false, reason: "no_migration" });
  });

  it("migrateConfig, що впала, — no_migration", () => {
    expect(resolveConfig({ ...guessPlugin, version: 3 }, {}, 0)).toMatchObject({ ok: false, reason: "no_migration" });
  });

  it("конфіг новішої версії плагіна — newer_version", () => {
    expect(resolveConfig(counterPlugin, { step: 1 }, 2)).toMatchObject({ ok: false, reason: "newer_version" });
  });
});
