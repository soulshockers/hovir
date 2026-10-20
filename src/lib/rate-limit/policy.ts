// Ліміти й чиста логіка ковзного вікна (openspec/specs/rate-limiting).

export interface LimitPolicy {
  limit: number;
  windowMs: number;
}

export const LIMITS = {
  /** Створення презентацій: 10 за ковзні 10 хвилин. */
  create: { limit: 10, windowMs: 10 * 60_000 },
  /** Невдалі спроби `INSTANCE_PASSWORD` (створення і `/admin` спільно): 5 за 15 хвилин. */
  password_fail: { limit: 5, windowMs: 15 * 60_000 },
} as const satisfies Record<string, LimitPolicy>;

export type Bucket = keyof typeof LIMITS;

export type LimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Межа вікна: зараховуються лише звернення, новіші за неї. */
export const windowCutoff = (now: Date, policy: LimitPolicy) => new Date(now.getTime() - policy.windowMs);

/** Секунди до звільнення місця у вікні: коли найстаріше зараховане звернення вийде за межу. */
export function retryAfterSeconds(oldestHit: Date, now: Date, policy: LimitPolicy): number {
  return Math.max(1, Math.ceil((oldestHit.getTime() + policy.windowMs - now.getTime()) / 1000));
}

/** Оцінка ліміту за мітками звернень у вікні (для перевірок без інкременту). */
export function evaluate(hits: Date[], now: Date, policy: LimitPolicy): LimitResult {
  const cutoff = windowCutoff(now, policy).getTime();
  const inWindow = hits.filter((hit) => hit.getTime() > cutoff).sort((a, b) => a.getTime() - b.getTime());
  if (inWindow.length < policy.limit) return { allowed: true };
  return { allowed: false, retryAfterSeconds: retryAfterSeconds(inWindow[0], now, policy) };
}
