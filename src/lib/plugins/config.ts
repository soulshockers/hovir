import type { SlidePlugin } from "./contract";

export interface ConfigIssue {
  path: PropertyKey[];
  message: string;
}

/**
 * - `invalid_config` — конфіг (після міграції) не проходить `configSchema`;
 * - `no_migration` — збережена версія старша за поточну, а `migrateConfig` немає або вона впала;
 * - `newer_version` — конфіг записано новішою версією плагіна (наприклад, preview-деплоєм над тією самою БД).
 */
export type ConfigResult<Config> =
  | { ok: true; config: Config }
  | { ok: false; reason: "invalid_config" | "no_migration" | "newer_version"; issues: ConfigIssue[] };

/** Конфіг слайда, готовий до використання: міграція за `plugin_version`, далі валідація `configSchema`. */
export function resolveConfig<Config>(
  plugin: Pick<SlidePlugin<Config, unknown, unknown, unknown, unknown>, "id" | "version" | "configSchema" | "migrateConfig">,
  raw: unknown,
  storedVersion: number,
): ConfigResult<Config> {
  if (storedVersion > plugin.version) {
    return fail("newer_version", `Конфіг записано версією ${storedVersion}, а плагін "${plugin.id}" має версію ${plugin.version}`);
  }

  let value = raw;
  if (storedVersion < plugin.version) {
    if (!plugin.migrateConfig) {
      return fail("no_migration", `Плагін "${plugin.id}" не має migrateConfig з версії ${storedVersion}`);
    }
    try {
      value = plugin.migrateConfig(raw, storedVersion);
    } catch (error) {
      return fail("no_migration", error instanceof Error ? error.message : String(error));
    }
  }

  const parsed = plugin.configSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_config",
      issues: parsed.error.issues.map(({ path, message }) => ({ path, message })),
    };
  }
  return { ok: true, config: parsed.data };
}

function fail(reason: "no_migration" | "newer_version", message: string): ConfigResult<never> {
  return { ok: false, reason, issues: [{ path: [], message }] };
}
