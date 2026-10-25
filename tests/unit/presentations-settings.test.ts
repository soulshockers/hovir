import { describe, expect, it } from "vitest";

import { settingsPatchSchema } from "@/lib/presentations/settings";

import { memoryDb } from "./fakes";

const parse = (value: unknown) => settingsPatchSchema.safeParse(value);
const codes = (value: unknown) => {
  const result = parse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("налаштування презентації", () => {
  it("назва обрізається, порожня й задовга — помилки з кодами", () => {
    expect(parse({ title: "  Лекція 2  " }).data).toEqual({ title: "Лекція 2" });
    expect(codes({ title: "   " })).toContain("title_required");
    expect(codes({ title: "я".repeat(121) })).toContain("title_too_long");
    expect(parse({ title: "я".repeat(120) }).success).toBe(true);
  });

  it("тема: пресет з переліку, акцент #RRGGBB, логотип або null", () => {
    expect(parse({ theme: { preset: "dark", accent: "#12abEF", logoUrl: null } }).success).toBe(true);
    expect(parse({ theme: { preset: "neon" } }).success).toBe(false);
    expect(codes({ theme: { preset: "light", accent: "red" } })).toContain("accent_invalid");
  });

  it("мова слухачів: uk | en | auto", () => {
    expect(parse({ locale: "en" }).success).toBe(true);
    expect(parse({ locale: "auto" }).success).toBe(true);
    expect(parse({ locale: "fr" }).success).toBe(false);
  });

  it("порожній патч і невідомі поля відхиляються", () => {
    expect(parse({}).success).toBe(false);
    expect(parse({ title: "Т", editTokenHash: "x" }).success).toBe(false);
  });

  it("часткове оновлення не чіпає інших полів", async () => {
    const { presentations } = memoryDb();
    const created = await presentations.insert({ title: "Стара", editTokenHash: "e", presentTokenHash: "p" });
    const updated = await presentations.updateSettings("e", { locale: "en" });
    expect(updated).toMatchObject({ id: created.id, title: "Стара", locale: "en", theme: { preset: "light" } });
    expect(await presentations.updateSettings("інший", { locale: "uk" })).toBeNull();
  });
});
