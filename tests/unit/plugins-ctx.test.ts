import { describe, expect, it } from "vitest";

import { createServerCtx } from "@/lib/plugins/ctx";
import { fakeCtx } from "@/lib/plugins/testing";

describe("ServerCtx", () => {
  it("createServerCtx: random() у [0, 1), now() — серверний час", () => {
    const ctx = createServerCtx({ participants: [], locale: "uk" });
    for (let i = 0; i < 1000; i++) {
      const value = ctx.random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(Math.abs(ctx.now() - Date.now())).toBeLessThan(1000);
  });

  it("fakeCtx повертає задані значення по черзі й керований час", () => {
    const ctx = fakeCtx({ now: 1000, randoms: [0.1, 0.9] });
    expect([ctx.random(), ctx.random(), ctx.random()]).toEqual([0.1, 0.9, 0.1]);
    ctx.advance(500);
    expect(ctx.now()).toBe(1500);
    expect(ctx.locale).toBe("uk");
  });
});
