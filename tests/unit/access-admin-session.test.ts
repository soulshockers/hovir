import { describe, expect, it } from "vitest";

import { adminCookieOptions, createAdminSession, verifyAdminSession } from "@/lib/access/admin-session";

const now = new Date("2026-10-20T10:00:00Z");
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);

describe("admin session", () => {
  it("чинна протягом 12 годин", () => {
    const { value, expiresAt } = createAdminSession("pw", now);
    expect(expiresAt).toEqual(later(12 * 3600));
    expect(verifyAdminSession("pw", value, now)).toBe(true);
    expect(verifyAdminSession("pw", value, later(12 * 3600 - 1))).toBe(true);
  });

  it("прострочена через 12 год + 1 с", () => {
    const { value } = createAdminSession("pw", now);
    expect(verifyAdminSession("pw", value, later(12 * 3600 + 1))).toBe(false);
  });

  it("підроблений підпис або подовжений строк", () => {
    const { value } = createAdminSession("pw", now);
    const [exp, sig] = value.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(verifyAdminSession("pw", `${exp}.${flipped}`, now)).toBe(false);
    expect(verifyAdminSession("pw", `${Number(exp) + 3600}.${sig}`, now)).toBe(false);
    expect(verifyAdminSession("pw", "garbage", now)).toBe(false);
    expect(verifyAdminSession("pw", undefined, now)).toBe(false);
  });

  it("недійсна після зміни пароля", () => {
    const { value } = createAdminSession("old-password", now);
    expect(verifyAdminSession("new-password", value, now)).toBe(false);
    expect(verifyAdminSession(undefined, value, now)).toBe(false);
  });

  it("атрибути cookie", () => {
    expect(adminCookieOptions(true)).toEqual({ httpOnly: true, sameSite: "strict", secure: true, path: "/", maxAge: 43200 });
    expect(adminCookieOptions(false).secure).toBe(false);
  });
});
