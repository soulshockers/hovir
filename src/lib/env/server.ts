import "server-only";

import { ConfigError, parseServerEnv, type EnvResult, type ServerEnv } from "./schema";

let cached: EnvResult<ServerEnv> | undefined;

/**
 * Лінива валідація: невалідна конфігурація не ламає застосунок на старті,
 * щоб сторінка стану могла пояснити, що не так.
 */
export function getServerEnvResult(): EnvResult<ServerEnv> {
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** Типізована конфігурація або `ConfigError` (лише назви змінних, без значень). */
export function getServerEnv(): ServerEnv {
  const result = getServerEnvResult();
  if (!result.ok) throw new ConfigError(result.issues.map((issue) => issue.variable));
  return result.env;
}
