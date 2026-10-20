import { describe, expect, it } from "vitest";

import { ConfigError } from "@/lib/env/common";
import { clientIpFromHeaders, deriveClientKey } from "@/lib/http/client-key";
import { errorResponse, rateLimited } from "@/lib/http/responses";

describe("clientIpFromHeaders", () => {
  it("бере x-real-ip", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7");
  });

  it("інакше — перший елемент x-forwarded-for", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("без заголовків — сталий ключ unknown", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});

describe("deriveClientKey", () => {
  it("не містить сирого IP і стабільний для того самого секрету", () => {
    const key = deriveClientKey("203.0.113.7", "service-secret");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("203.0.113.7");
    expect(deriveClientKey("203.0.113.7", "service-secret")).toBe(key);
    expect(deriveClientKey("203.0.113.7", "other-secret")).not.toBe(key);
    expect(deriveClientKey("203.0.113.8", "service-secret")).not.toBe(key);
  });
});

describe("errorResponse", () => {
  const dbUrl = "postgres://postgres.abcd:pw-Secret1@db-host.internal:6543/postgres";

  it("недоступна БД → 503 без тексту помилки драйвера", async () => {
    const logs: string[] = [];
    const error = Object.assign(new Error(`connect ECONNREFUSED db-host.internal ${dbUrl}`), { code: "ECONNREFUSED" });
    const response = errorResponse(error, (m) => logs.push(m), [dbUrl]);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: { code: "service_unavailable" } });
    expect(text).not.toContain("ECONNREFUSED");
    expect(logs.join("\n")).not.toContain("pw-Secret1");
    expect(logs.join("\n")).not.toContain("db-host.internal");
  });

  it("невалідна конфігурація → 503 без значень змінних", async () => {
    const response = errorResponse(new ConfigError(["POSTGRES_URL"]), () => {});
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "service_unavailable" } });
  });

  it("інша помилка → 500 internal_error", async () => {
    const response = errorResponse(new Error("boom"), () => {});
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "internal_error" } });
  });
});

describe("rateLimited", () => {
  it("429 з цілим додатним Retry-After і кодом rate_limited", async () => {
    const response = rateLimited(12.2);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("13");
    expect(await response.json()).toEqual({ error: { code: "rate_limited" } });
    expect(rateLimited(0).headers.get("Retry-After")).toBe("1");
  });
});
