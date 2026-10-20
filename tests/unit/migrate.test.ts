import { describe, expect, it } from "vitest";

import { maskConnectionDetails, planMigration } from "../../scripts/migrate-config";

const pooled = "postgres://postgres.abcdref:pw-Secret1@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
const session = "postgres://postgres.abcdref:pw-Secret1@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";

describe("planMigration", () => {
  it("віддає перевагу POSTGRES_URL_NON_POOLING", () => {
    expect(planMigration({ POSTGRES_URL: pooled, POSTGRES_URL_NON_POOLING: session })).toEqual({
      action: "run",
      url: session,
      source: "POSTGRES_URL_NON_POOLING",
    });
  });

  it("переходить на POSTGRES_URL, якщо non-pooling порожній", () => {
    expect(planMigration({ POSTGRES_URL: pooled, POSTGRES_URL_NON_POOLING: "" })).toMatchObject({
      action: "run",
      source: "POSTGRES_URL",
    });
  });

  it("локально без URL пропускає міграції з попередженням", () => {
    expect(planMigration({})).toMatchObject({ action: "skip" });
  });

  it("на Vercel без URL завершується помилкою з підказкою про Marketplace", () => {
    const plan = planMigration({ VERCEL: "1" });
    expect(plan.action).toBe("fail");
    expect(plan.action === "fail" && plan.message).toContain("Vercel Marketplace");
  });
});

describe("maskConnectionDetails", () => {
  it("прибирає пароль, користувача, хост і рядки підключення", () => {
    const text = `connect to ${session} failed; password authentication failed for user "postgres.abcdref" at aws-0-eu-central-1.pooler.supabase.com (pw-Secret1)`;
    const masked = maskConnectionDetails(text, [session, pooled]);
    expect(masked).not.toContain("pw-Secret1");
    expect(masked).not.toContain("postgres.abcdref");
    expect(masked).not.toContain("pooler.supabase.com");
    expect(masked).toContain("postgres://***");
  });

  it("ігнорує некоректні URL", () => {
    expect(maskConnectionDetails("boom", ["not a url"])).toBe("boom");
  });
});
