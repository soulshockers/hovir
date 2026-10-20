import { describe, expect, it } from "vitest";

import { generateToken, hashToken } from "@/lib/access/tokens";
import { createInputSchema, createPresentation, findByToken, reissueToken } from "@/lib/presentations/service";

import { memoryDb } from "./fakes";

describe("назва презентації", () => {
  const title = (value: unknown) => createInputSchema.safeParse({ title: value });

  it("обрізається від пробілів", () => {
    expect(title("  Лекція 1  ").data?.title).toBe("Лекція 1");
  });

  it("без назви — «Нова презентація»", () => {
    expect(createInputSchema.parse({}).title).toBe("Нова презентація");
    expect(title("   ").data?.title).toBe("Нова презентація");
  });

  it("120 символів — можна, 121 — ні", () => {
    expect(title("я".repeat(120)).success).toBe(true);
    expect(title(" " + "я".repeat(121) + " ").success).toBe(false);
  });

  it("не рядок — помилка валідації", () => {
    expect(title(42).success).toBe(false);
  });
});

describe("createPresentation", () => {
  it("передає в БД лише хеші й повертає сирі токени один раз", async () => {
    const db = memoryDb();
    const created = await createPresentation(db.presentations, "Лекція 1");
    expect(created.editToken).not.toBe(created.presentToken);
    const [, row] = db.calls[0] as [string, Record<string, string>];
    expect(row).toEqual({ title: "Лекція 1", editTokenHash: hashToken(created.editToken), presentTokenHash: hashToken(created.presentToken) });
    expect(JSON.stringify(db.calls)).not.toContain(created.editToken);
    expect(JSON.stringify(db.calls)).not.toContain(created.presentToken);
  });
});

describe("findByToken", () => {
  it("некоректний формат — без запиту до БД", async () => {
    const db = memoryDb();
    expect(await findByToken(db.presentations, "present", "abc")).toBeNull();
    expect(db.calls).toHaveLength(0);
  });

  it("present-токен не відкриває edit-доступ", async () => {
    const db = memoryDb();
    const created = await createPresentation(db.presentations, "Т");
    expect(await findByToken(db.presentations, "edit", created.editToken)).toMatchObject({ title: "Т" });
    expect(await findByToken(db.presentations, "edit", created.presentToken)).toBeNull();
    expect(await findByToken(db.presentations, "present", created.presentToken)).toMatchObject({ title: "Т" });
  });
});

describe("reissueToken", () => {
  it("замінює present-токен, старий перестає діяти", async () => {
    const db = memoryDb();
    const created = await createPresentation(db.presentations, "Т");
    const result = await reissueToken(db.presentations, created.editToken, "present");
    expect(result?.token).toBeDefined();
    expect(await findByToken(db.presentations, "present", created.presentToken)).toBeNull();
    expect(await findByToken(db.presentations, "present", result!.token)).not.toBeNull();
  });

  it("зі старим або випадковим токеном — null", async () => {
    const db = memoryDb();
    const created = await createPresentation(db.presentations, "Т");
    await reissueToken(db.presentations, created.editToken, "edit");
    expect(await reissueToken(db.presentations, created.editToken, "edit")).toBeNull();
    expect(await reissueToken(db.presentations, generateToken(), "present")).toBeNull();
    expect(await reissueToken(db.presentations, "abc", "present")).toBeNull();
  });
});
