import type { Locale, ParticipantInfo, ServerCtx } from "../contract";

export interface FakeCtx extends ServerCtx {
  /** Зсуває час `now()` вперед. */
  advance(ms: number): void;
}

/** Детермінований `ServerCtx` для тестів: фіксований час і задані `random()` по черзі (по колу). */
export function fakeCtx(
  options: { now?: number; randoms?: number[]; participants?: ParticipantInfo[]; locale?: Locale } = {},
): FakeCtx {
  let now = options.now ?? Date.UTC(2026, 0, 1);
  const randoms = options.randoms?.length ? options.randoms : [0.5];
  let next = 0;
  return {
    now: () => now,
    random: () => randoms[next++ % randoms.length],
    participants: options.participants ?? [],
    locale: options.locale ?? "uk",
    advance(ms) {
      now += ms;
    },
  };
}
