import { describe, expect, it } from "vitest";

import { createRegistry, getRegistry } from "@/lib/plugins/registry";

import { counterPlugin, guessPlugin } from "./plugin-fixtures";

describe("реєстр плагінів", () => {
  it("знаходить плагін за id і повертає undefined для невідомого", () => {
    const registry = createRegistry([counterPlugin, guessPlugin]);
    expect(registry.get("guess-number")).toBe(guessPlugin);
    expect(registry.get("missing")).toBeUndefined();
  });

  it("дубль id — помилка з назвою дубля", () => {
    expect(() => createRegistry([counterPlugin, { ...guessPlugin, id: "counter" }])).toThrow(/"counter"/);
  });

  it("реєстр plugins/index.ts має унікальні id", () => {
    expect(() => getRegistry()).not.toThrow();
  });
});
