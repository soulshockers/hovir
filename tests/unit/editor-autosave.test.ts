import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSaveQueue, sendResultFromResponse, type SendResult } from "@/lib/editor/autosave";

function deferred() {
  let resolve!: (result: SendResult) => void;
  const promise = new Promise<SendResult>((r) => (resolve = r));
  return { promise, resolve };
}

describe("черга автозбереження", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounce 800 мс: кілька правок — один запит з останнім знімком", async () => {
    const sent: unknown[] = [];
    const queue = createSaveQueue<string>({ send: async (value) => (sent.push(value), { ok: true }) });
    queue.update("a");
    await vi.advanceTimersByTimeAsync(500);
    queue.update("ab");
    await vi.advanceTimersByTimeAsync(799);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual(["ab"]);
    expect(queue.status()).toBe("saved");
    expect(queue.hasUnsaved()).toBe(false);
  });

  it("один запит у дорозі: наступний відправляє останній знімок після завершення попереднього", async () => {
    const calls: { value: string; done: ReturnType<typeof deferred> }[] = [];
    const queue = createSaveQueue<string>({
      send: (value) => {
        const done = deferred();
        calls.push({ value, done });
        return done.promise;
      },
    });
    queue.update("v1");
    await vi.advanceTimersByTimeAsync(800);
    queue.update("v2");
    await vi.advanceTimersByTimeAsync(800);
    queue.update("v3");
    await vi.advanceTimersByTimeAsync(800);
    expect(calls.map((c) => c.value)).toEqual(["v1"]);
    calls[0].done.resolve({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((c) => c.value)).toEqual(["v1", "v3"]);
    calls[1].done.resolve({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.status()).toBe("saved");
  });

  it("мережева помилка: статус error і повтор з backoff без втрати даних", async () => {
    const sent: string[] = [];
    let fail = 2;
    const queue = createSaveQueue<string>({
      send: async (value) => {
        sent.push(value);
        if (fail-- > 0) throw new TypeError("Failed to fetch");
        return { ok: true };
      },
    });
    queue.update("текст");
    await vi.advanceTimersByTimeAsync(800);
    expect(queue.status()).toBe("error");
    expect(queue.error()).toContain("з'єднатися");
    expect(queue.hasUnsaved()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sent).toEqual(["текст", "текст", "текст"]);
    expect(queue.status()).toBe("saved");
  });

  it("429: повтор після Retry-After", async () => {
    const sent: string[] = [];
    let first = true;
    const queue = createSaveQueue<string>({
      send: async (value) => {
        sent.push(value);
        if (first) {
          first = false;
          return sendResultFromResponse(new Response(null, { status: 429, headers: { "Retry-After": "3" } }), async () => "ліміт");
        }
        return { ok: true };
      },
    });
    queue.update("x");
    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(2999);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(2);
  });

  it("400: помилка без повтору", async () => {
    const sent: string[] = [];
    const queue = createSaveQueue<string>({
      send: async (value) => {
        sent.push(value);
        return sendResultFromResponse(Response.json({ error: { code: "validation_failed" } }, { status: 400 }), async () => "невалідно");
      },
    });
    queue.update("x");
    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toHaveLength(1);
    expect(queue.status()).toBe("error");
    expect(queue.error()).toBe("невалідно");
    expect(queue.hasUnsaved()).toBe(false);
  });

  it("flush на pagehide відправляє одразу з keepalive", async () => {
    const sent: { value: string; keepalive: boolean }[] = [];
    const queue = createSaveQueue<string>({ send: async (value, { keepalive }) => (sent.push({ value, keepalive }), { ok: true }) });
    queue.update("остання правка");
    queue.flush({ keepalive: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([{ value: "остання правка", keepalive: true }]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sent).toHaveLength(1);
  });

  it("settle чекає на збереження відкладених змін", async () => {
    const sent: string[] = [];
    const queue = createSaveQueue<string>({ send: async (value) => (sent.push(value), { ok: true }) });
    queue.update("a");
    const settled = queue.settle();
    await vi.advanceTimersByTimeAsync(0);
    await settled;
    expect(sent).toEqual(["a"]);
  });
});
