"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `true` після гідратації. Форми з паролем лишаються вимкненими до неї: інакше браузер відправив би
 * форму нативно, без нашого обробника.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
