import { describe, expect, it } from "vitest";

import { evaluate, LIMITS, retryAfterSeconds } from "@/lib/rate-limit/policy";

const now = new Date("2026-10-20T10:00:00Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe("ковзне вікно", () => {
  it("пропускає, поки у вікні менше за ліміт", () => {
    const hits = Array.from({ length: 9 }, (_, i) => ago(i * 10));
    expect(evaluate(hits, now, LIMITS.create)).toEqual({ allowed: true });
  });

  it("11-те створення за 10 хвилин відхиляється з часом до звільнення найстарішого", () => {
    const hits = Array.from({ length: 10 }, (_, i) => ago(540 - i * 10)); // найстаріше — 9 хв тому
    expect(evaluate(hits, now, LIMITS.create)).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it("після вікна знову дозволяє", () => {
    const hits = Array.from({ length: 10 }, () => ago(601));
    expect(evaluate(hits, now, LIMITS.create)).toEqual({ allowed: true });
  });

  it("5 невдалих паролів за 15 хвилин блокують", () => {
    const hits = Array.from({ length: 5 }, (_, i) => ago(60 * i));
    expect(evaluate(hits, now, LIMITS.password_fail)).toEqual({ allowed: false, retryAfterSeconds: 15 * 60 - 240 });
  });

  it("Retry-After не менше 1 секунди", () => {
    expect(retryAfterSeconds(ago(600), now, LIMITS.create)).toBe(1);
  });
});
