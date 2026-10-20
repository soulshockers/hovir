import { describe, expect, it } from "vitest";

import { generateToken, hashToken, isTokenFormat } from "@/lib/access/tokens";

describe("generateToken", () => {
  it("видає 43 символи base64url (256 біт)", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("не повторюється на 1000 токенах", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));
    expect(tokens.size).toBe(1000);
  });
});

describe("isTokenFormat", () => {
  it("приймає згенерований токен", () => {
    expect(isTokenFormat(generateToken())).toBe(true);
  });

  it.each([
    ["коротке значення", "abc"],
    ["символ +", "+".padEnd(43, "a")],
    ["символ /", "/".padEnd(43, "a")],
    ["доповнення =", "a".repeat(42) + "="],
    ["довше за 43 символи", "a".repeat(44)],
    ["порожній рядок", ""],
  ])("відхиляє: %s", (_label, value) => {
    expect(isTokenFormat(value)).toBe(false);
  });

  it("відхиляє не-рядки", () => {
    expect(isTokenFormat(undefined)).toBe(false);
    expect(isTokenFormat(42)).toBe(false);
  });
});

describe("hashToken", () => {
  it("рахує SHA-256 у hex (відомий вектор)", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("не містить самого токена", () => {
    const token = generateToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});
