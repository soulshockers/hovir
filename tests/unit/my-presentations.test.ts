import { describe, expect, it } from "vitest";

import { linksFileName, linksFileText } from "@/lib/my-presentations/links-file";
import {
  readMyPresentations,
  removeMyPresentation,
  STORAGE_KEY,
  upsertMyPresentation,
  type StorageLike,
} from "@/lib/my-presentations/store";

function memoryStorage(initial?: string): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
};

const entry = (id: string, createdAt: string, extra: object = {}) => ({ id, title: `П ${id}`, createdAt, ...extra });

describe("«Мої презентації»", () => {
  it("порожній список у новому браузері", () => {
    expect(readMyPresentations(memoryStorage())).toEqual({ ok: true, items: [] });
  });

  it("upsert додає записи, найновіші першими", () => {
    const storage = memoryStorage();
    upsertMyPresentation(storage, entry("a", "2026-01-01T00:00:00Z", { editUrl: "e1" }));
    upsertMyPresentation(storage, entry("b", "2026-02-01T00:00:00Z"));
    const result = readMyPresentations(storage);
    expect(result.ok && result.items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("після перевипуску present-посилання замінюється, edit зберігається", () => {
    const storage = memoryStorage();
    upsertMyPresentation(storage, entry("a", "2026-01-01T00:00:00Z", { editUrl: "e1", presentUrl: "p1" }));
    upsertMyPresentation(storage, { id: "a", title: "П a", createdAt: "2026-01-01T00:00:00Z", presentUrl: "p2" });
    const result = readMyPresentations(storage);
    expect(result.ok && result.items).toEqual([entry("a", "2026-01-01T00:00:00Z", { editUrl: "e1", presentUrl: "p2" })]);
  });

  it("прибирання запису", () => {
    const storage = memoryStorage();
    upsertMyPresentation(storage, entry("a", "2026-01-01T00:00:00Z"));
    removeMyPresentation(storage, "a");
    expect(readMyPresentations(storage)).toEqual({ ok: true, items: [] });
  });

  it("пошкоджений JSON і пошкоджені записи ігноруються", () => {
    expect(readMyPresentations(memoryStorage("{not json"))).toEqual({ ok: true, items: [] });
    const mixed = JSON.stringify([{ id: 1 }, "x", null, entry("ok", "2026-01-01T00:00:00Z")]);
    const result = readMyPresentations(memoryStorage(mixed));
    expect(result.ok && result.items.map((i) => i.id)).toEqual(["ok"]);
    const storage = memoryStorage("{not json");
    expect(upsertMyPresentation(storage, entry("a", "2026-01-01T00:00:00Z"))).toBe(true);
  });

  it("недоступне сховище не кидає винятків", () => {
    expect(readMyPresentations(throwing)).toEqual({ ok: false });
    expect(readMyPresentations(null)).toEqual({ ok: false });
    expect(upsertMyPresentation(throwing, entry("a", "2026-01-01T00:00:00Z"))).toBe(false);
    expect(removeMyPresentation(throwing, "a")).toBe(false);
  });
});

describe("файл посилань", () => {
  it("містить назву, дату, обидва посилання й попередження", () => {
    const text = linksFileText({
      title: "Лекція 1",
      createdAt: new Date("2026-10-20T10:00:00Z"),
      editUrl: "https://i.example/e/EDIT",
      presentUrl: "https://i.example/p/PRESENT",
    });
    expect(text).toContain("Лекція 1");
    expect(text).toContain("2026-10-20T10:00:00.000Z");
    expect(text).toContain("https://i.example/e/EDIT");
    expect(text).toContain("https://i.example/p/PRESENT");
    expect(text).toMatch(/повний доступ/);
  });

  it("безпечна назва файлу", () => {
    expect(linksFileName('Лекція 1: "вступ"/2')).toBe("Лекція 1 вступ 2 — посилання.txt");
    expect(linksFileName("   ")).toBe("presentation — посилання.txt");
  });
});
