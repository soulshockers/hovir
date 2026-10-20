import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { clientEnvSchema, parseClientEnv, parseServerEnv, serverEnvSchema } from "@/lib/env/schema";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-secret-value",
  POSTGRES_URL: "postgres://postgres.abcd:pw-secret@aws-0-eu.pooler.supabase.com:6543/postgres",
};

describe("serverEnvSchema", () => {
  it("приймає повну конфігурацію і підставляє дефолти опційних змінних", () => {
    const result = parseServerEnv(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.DEFAULT_LOCALE).toBe("uk");
    expect(result.env.RESULTS_RETENTION_DAYS).toBe(90);
    expect(result.env.INSTANCE_PASSWORD).toBeUndefined();
    expect(result.env.POSTGRES_URL_NON_POOLING).toBeUndefined();
  });

  it("вважає порожні рядки незаданими", () => {
    const result = parseServerEnv({ ...valid, INSTANCE_PASSWORD: "", DEFAULT_LOCALE: "", RESULTS_RETENTION_DAYS: " " });
    expect(result.ok && result.env.INSTANCE_PASSWORD).toBeUndefined();
    expect(result.ok && result.env.DEFAULT_LOCALE).toBe("uk");
    expect(result.ok && result.env.RESULTS_RETENTION_DAYS).toBe(90);
  });

  it("приводить RESULTS_RETENTION_DAYS до числа", () => {
    const result = parseServerEnv({ ...valid, RESULTS_RETENTION_DAYS: "30", DEFAULT_LOCALE: "en" });
    expect(result.ok && result.env.RESULTS_RETENTION_DAYS).toBe(30);
    expect(result.ok && result.env.DEFAULT_LOCALE).toBe("en");
  });

  it.each([
    ["DEFAULT_LOCALE", "fr"],
    ["RESULTS_RETENTION_DAYS", "-5"],
    ["NEXT_PUBLIC_SUPABASE_URL", "not a url"],
    ["POSTGRES_URL", "mysql://x"],
  ])("відхиляє некоректне %s без підстановки дефолту", (variable, value) => {
    const result = parseServerEnv({ ...valid, [variable]: value });
    expect(result).toEqual({ ok: false, issues: [{ variable, problem: "invalid" }] });
  });

  it("звітує про відсутні змінні лише назвами, без значень", () => {
    const result = parseServerEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "", POSTGRES_URL: undefined });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { variable: "SUPABASE_SERVICE_ROLE_KEY", problem: "missing" },
      { variable: "POSTGRES_URL", problem: "missing" },
    ]);
    const serialized = JSON.stringify(parseServerEnv({ ...valid, POSTGRES_URL: "mysql://user:pw-secret@host" }));
    expect(serialized).not.toContain("pw-secret");
  });
});

describe("clientEnvSchema", () => {
  it("містить лише публічні змінні", () => {
    expect(Object.keys(clientEnvSchema.shape).every((key) => key.startsWith("NEXT_PUBLIC_"))).toBe(true);
    expect(parseClientEnv(valid).ok).toBe(true);
  });
});

describe(".env.example", () => {
  it("містить рівно ті змінні, що описані в схемах", () => {
    const content = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    const keys = [...content.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]).sort();
    const schemaKeys = [...new Set([...Object.keys(serverEnvSchema.shape), ...Object.keys(clientEnvSchema.shape)])].sort();
    expect(keys).toEqual(schemaKeys);
  });
});
