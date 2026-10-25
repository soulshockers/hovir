// Автозбереження редактора (openspec/changes/archive/2026-10-25-add-presentation-editor/design.md «Автозбереження»). Чиста логіка без React:
// одна черга на слайд (і одна на налаштування) з debounce і не більше ніж одним запитом у дорозі. Наступний запит
// відправляє останній знімок, тож старіша версія не може перезаписати новішу на сервері.

export type SendResult =
  | { ok: true }
  /** `retry` — мережева помилка, 5xx чи 429 (з `retryAfterMs`); інакше помилка показується без повтору. */
  | { ok: false; retry: boolean; retryAfterMs?: number; message: string };

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface SaveQueue<T> {
  /** Новий знімок; відправляється після паузи `debounceMs`. */
  update(value: T): void;
  /** Відправити незбережене негайно (`keepalive` — для `pagehide`/`visibilitychange`). */
  flush(options?: { keepalive?: boolean }): void;
  /** Проміс, що завершується, коли все збережено або сталася помилка. */
  settle(): Promise<void>;
  /** Є зміни, що ще не дійшли до сервера. */
  hasUnsaved(): boolean;
  status(): SaveStatus;
  error(): string | null;
  /** Скасувати таймери (слайд видалено). */
  dispose(): void;
}

export interface SaveQueueOptions<T> {
  send(value: T, options: { keepalive: boolean }): Promise<SendResult>;
  onChange?(status: SaveStatus, error: string | null): void;
  debounceMs?: number;
  /** Затримки повторів: 1, 2, 4 … до 30 с. */
  retryDelayMs?(attempt: number): number;
}

export const DEBOUNCE_MS = 800;
export const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);

export function createSaveQueue<T>({ send, onChange, debounceMs = DEBOUNCE_MS, retryDelayMs = backoff }: SaveQueueOptions<T>): SaveQueue<T> {
  let latest: T | undefined;
  let dirty = false;
  let inFlight = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let state: SaveStatus = "idle";
  let message: string | null = null;
  let disposed = false;
  let waiters: (() => void)[] = [];

  const setState = (next: SaveStatus, error: string | null = null) => {
    state = next;
    message = error;
    onChange?.(state, message);
    if (next === "saved" || next === "error" || next === "idle") {
      const resolve = waiters;
      waiters = [];
      resolve.forEach((fn) => fn());
    }
  };

  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void run(false);
    }, ms);
  };

  async function run(keepalive: boolean) {
    if (disposed || !dirty || (inFlight && !keepalive)) return;
    const value = latest as T;
    dirty = false;
    inFlight = true;
    setState("saving");
    let result: SendResult;
    try {
      result = await send(value, { keepalive });
    } catch {
      result = { ok: false, retry: true, message: "Не вдалося з'єднатися із сервером." };
    }
    inFlight = false;
    if (disposed) return;

    if (result.ok) {
      attempt = 0;
      if (dirty) {
        if (!timer) void run(false);
      } else setState("saved");
      return;
    }
    if (result.retry) {
      dirty = true;
      setState("error", result.message);
      schedule(result.retryAfterMs ?? retryDelayMs(attempt++));
      return;
    }
    // Помилку без повтору (наприклад, 400) показуємо; нові правки знову підуть на сервер.
    attempt = 0;
    if (dirty) schedule(debounceMs);
    setState("error", result.message);
  }

  return {
    update(value) {
      if (disposed) return;
      latest = value;
      dirty = true;
      if (state !== "error") setState("pending");
      schedule(debounceMs);
    },
    flush({ keepalive = false } = {}) {
      if (!dirty) return;
      clearTimeout(timer);
      timer = undefined;
      void run(keepalive);
    },
    settle() {
      if (!dirty && !inFlight) return Promise.resolve();
      return new Promise((resolve) => {
        waiters.push(resolve);
        if (dirty && !inFlight && !timer) void run(false);
        else if (dirty && timer) {
          clearTimeout(timer);
          timer = undefined;
          void run(false);
        }
      });
    },
    hasUnsaved: () => dirty || inFlight,
    status: () => state,
    error: () => message,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      const resolve = waiters;
      waiters = [];
      resolve.forEach((fn) => fn());
    },
  };
}

/** Відповідь API → результат для черги: мережа/5xx/429 повторюються, решта — показується. */
export async function sendResultFromResponse(response: Response, describe: (response: Response) => Promise<string>): Promise<SendResult> {
  if (response.ok) return { ok: true };
  const message = await describe(response);
  if (response.status === 429) {
    const seconds = Number(response.headers.get("Retry-After")) || 5;
    return { ok: false, retry: true, retryAfterMs: seconds * 1000, message };
  }
  return { ok: false, retry: response.status >= 500, message };
}
