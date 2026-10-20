// Порт сховища стану слайда (openspec/specs/slide-plugin-runtime/spec.md «Сховище стану слайда»).
// Реалізацію на Postgres (`slide_states` під `SELECT … FOR UPDATE`) дає openspec/changes/add-live-sessions; вона мусить
// проходити той самий контрактний набір, що й `memorySlideStateStore` (`@/lib/plugins/testing/store-contract`).

export interface SlideKey {
  sessionId: string;
  slideId: string;
}

/** Що повернути з критичної секції: `state` — записати новий стан (без нього стан не змінюється). */
export interface SlideStateUpdate<T> {
  result: T;
  state?: unknown;
}

export interface SlideStateStore {
  /**
   * Серіалізований доступ до стану одного слайда: `fn` бачить останній збережений стан (`undefined` — його ще немає),
   * а виклики з тим самим ключем виконуються по черзі. Різні ключі одне одного не блокують.
   */
  withSlideState<T>(key: SlideKey, fn: (current: unknown) => SlideStateUpdate<T> | Promise<SlideStateUpdate<T>>): Promise<T>;
}

/** Сховище в пам'яті для тестів. Стан проходить через JSON, як у колонці `jsonb`. */
export function memorySlideStateStore(): SlideStateStore {
  const states = new Map<string, string>();
  const queues = new Map<string, Promise<unknown>>();

  return {
    withSlideState(key, fn) {
      const id = `${key.sessionId}\u0000${key.slideId}`;
      const run = async () => {
        const stored = states.get(id);
        const update = await fn(stored === undefined ? undefined : JSON.parse(stored));
        if (update.state !== undefined) states.set(id, JSON.stringify(update.state));
        return update.result;
      };
      const next = (queues.get(id) ?? Promise.resolve()).then(run);
      const settled = next.catch(() => {});
      queues.set(id, settled);
      void settled.then(() => {
        if (queues.get(id) === settled) queues.delete(id);
      });
      return next;
    },
  };
}
