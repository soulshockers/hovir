import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDb, resetDb, withDbDeadline } from "@/lib/db/client";
import { TimeoutError } from "@/lib/db/errors";
import { handleCreatePresentation } from "@/lib/presentations/api";

import { BASE_ENV, fakeDeps, jsonRequest } from "./fakes";

const never = () => new Promise<never>(() => {});

describe("withDbDeadline", () => {
  const saved = { ...process.env };
  beforeEach(() => Object.assign(process.env, BASE_ENV));
  afterEach(() => {
    resetDb();
    process.env = { ...saved };
  });

  it("застряглий запит отримує TimeoutError, а паралельні завершуються", async () => {
    const started = Date.now();
    const stuck = withDbDeadline(never, 50);
    const others = await Promise.all([1, 2, 3].map((n) => withDbDeadline(async () => n, 1000)));
    expect(others).toEqual([1, 2, 3]);
    await expect(stuck).rejects.toBeInstanceOf(TimeoutError);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("після дедлайну пул скидається: наступний getDb() — новий клієнт", async () => {
    const before = getDb();
    await expect(withDbDeadline(never, 20)).rejects.toBeInstanceOf(TimeoutError);
    expect(getDb()).not.toBe(before);
  });

  it("помилку роботи передає без змін і не скидає пул", async () => {
    const before = getDb();
    await expect(withDbDeadline(async () => Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
    expect(getDb()).toBe(before);
  });
});

describe("API із застряглою БД", () => {
  it("відповідає 503 після дедлайну, а наступний запит обробляється", async () => {
    let hang = true;
    const ctx = fakeDeps({ runDb: (work) => withDbDeadline(work, 50) });
    const limiter = ctx.deps.limiter();
    ctx.deps.limiter = () => ({
      hit: (...args) => (hang ? never() : limiter.hit(...args)),
      peek: (...args) => limiter.peek(...args),
    });
    const stuck = await handleCreatePresentation(jsonRequest("/api/presentations", {}), ctx.deps);
    expect(stuck.status).toBe(503);
    expect(await stuck.json()).toEqual({ error: { code: "service_unavailable" } });

    hang = false;
    expect((await handleCreatePresentation(jsonRequest("/api/presentations", {}), ctx.deps)).status).toBe(201);
    resetDb();
  });
});
