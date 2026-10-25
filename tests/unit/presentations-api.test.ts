import { describe, expect, it } from "vitest";

import { ConfigError } from "@/lib/env/common";
import { handleCreatePresentation, handleReissue, handleUpdateSettings } from "@/lib/presentations/api";

import { fakeDeps, jsonRequest } from "./fakes";

const create = (body: unknown, deps: ReturnType<typeof fakeDeps>["deps"]) =>
  handleCreatePresentation(jsonRequest("/api/presentations", body), deps);

describe("POST /api/presentations", () => {
  it("201 з id, назвою й обома токенами", async () => {
    const { deps } = fakeDeps();
    const response = await create({ title: "  Лекція 1  " }, deps);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ title: "Лекція 1" });
    expect(Object.keys(body).sort()).toEqual(["editToken", "id", "presentToken", "title"]);
  });

  it("400 для задовгої назви чи не-JSON", async () => {
    const { deps, db } = fakeDeps();
    expect((await create({ title: "x".repeat(121) }, deps)).status).toBe(400);
    const raw = new Request("https://instance.example/api/presentations", { method: "POST", body: "nope" });
    expect((await handleCreatePresentation(raw, deps)).status).toBe(400);
    expect(db.rows).toHaveLength(0);
  });

  it("401 password_required і invalid_password, коли пароль задано", async () => {
    const { deps, db } = fakeDeps({ env: { INSTANCE_PASSWORD: "s3cret" } });
    const missing = await create({}, deps);
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: { code: "password_required" } });
    const wrong = await create({ password: "nope" }, deps);
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: { code: "invalid_password" } });
    expect(db.rows).toHaveLength(0);
    expect((await create({ password: "s3cret" }, deps)).status).toBe(201);
  });

  it("без INSTANCE_PASSWORD пароль не потрібен", async () => {
    const { deps } = fakeDeps();
    expect((await create({}, deps)).status).toBe(201);
  });

  it("429 на 11-те створення, з Retry-After", async () => {
    const { deps, db } = fakeDeps();
    for (let i = 0; i < 10; i++) expect((await create({}, deps)).status).toBe(201);
    const response = await create({}, deps);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await response.json()).toEqual({ error: { code: "rate_limited" } });
    expect(db.rows).toHaveLength(10);
  });

  it("429 навіть з правильним паролем після 5 невдалих", async () => {
    const { deps, db } = fakeDeps({ env: { INSTANCE_PASSWORD: "s3cret" } });
    for (let i = 0; i < 5; i++) expect((await create({ password: `bad-${i}` }, deps)).status).toBe(401);
    const response = await create({ password: "s3cret" }, deps);
    expect(response.status).toBe(429);
    expect(db.rows).toHaveLength(0);
  });

  it("503 service_unavailable при невалідній конфігурації чи недоступній БД", async () => {
    const config = fakeDeps({ getEnv: () => { throw new ConfigError(["POSTGRES_URL"]); } });
    const r1 = await create({}, config.deps);
    expect(r1.status).toBe(503);
    expect(await r1.json()).toEqual({ error: { code: "service_unavailable" } });

    const down = fakeDeps();
    down.deps.limiter = () => ({
      hit: async () => { throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }); },
      peek: async () => ({ allowed: true }),
    });
    const r2 = await create({}, down.deps);
    expect(r2.status).toBe(503);
    expect(await r2.text()).not.toContain("ECONNREFUSED");
  });

  it("не логує пароль", async () => {
    const { deps, logs } = fakeDeps({ env: { INSTANCE_PASSWORD: "s3cret" } });
    await create({ password: "guess-123" }, deps);
    expect(logs.join("\n")).not.toContain("guess-123");
  });
});

describe("POST /api/presentations/reissue", () => {
  async function setup() {
    const ctx = fakeDeps();
    const created = await (await create({ title: "Т" }, ctx.deps)).json();
    const reissue = (token: string | undefined, body: unknown, path = "/api/presentations/reissue") =>
      handleReissue(jsonRequest(path, body, { headers: token ? { authorization: `Bearer ${token}` } : {} }), ctx.deps);
    return { ...ctx, created, reissue };
  }

  it("перевипускає present- і edit-токен", async () => {
    const { created, reissue } = await setup();
    const present = await reissue(created.editToken, { kind: "present" });
    expect(present.status).toBe(200);
    const presentBody = await present.json();
    expect(presentBody).toMatchObject({ kind: "present", title: "Т" });
    expect(presentBody.token).not.toBe(created.presentToken);

    const edit = await reissue(created.editToken, { kind: "edit" });
    const editBody = await edit.json();
    expect(editBody.kind).toBe("edit");
    expect((await reissue(created.editToken, { kind: "present" })).status).toBe(404);
    expect((await reissue(editBody.token, { kind: "present" })).status).toBe(200);
  });

  it("present-токен в Authorization — 404", async () => {
    const { created, reissue } = await setup();
    const response = await reissue(created.presentToken, { kind: "present" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });
  });

  it("токен у query-рядку не приймається", async () => {
    const { created, reissue } = await setup();
    const response = await reissue(undefined, { kind: "present" }, `/api/presentations/reissue?token=${created.editToken}`);
    expect(response.status).toBe(404);
  });

  it("некоректний токен — той самий 404, невідомий kind — 400", async () => {
    const { created, reissue } = await setup();
    expect((await reissue("abc", { kind: "edit" })).status).toBe(404);
    expect((await reissue(created.editToken, { kind: "other" })).status).toBe(400);
  });
});

describe("PATCH /api/presentations/settings", () => {
  async function setup() {
    const ctx = fakeDeps();
    const created = await (await create({ title: "Т" }, ctx.deps)).json();
    const patch = (token: string | undefined, body: unknown) =>
      handleUpdateSettings(
        jsonRequest("/api/presentations/settings", body, { method: "PATCH", headers: token ? { authorization: `Bearer ${token}` } : {} }),
        ctx.deps,
      );
    return { ...ctx, created, patch };
  }

  it("оновлює назву, тему й мову", async () => {
    const { created, patch } = await setup();
    const response = await patch(created.editToken, { title: " Лекція 2 ", locale: "en", theme: { preset: "dark", accent: "#112233" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: created.id, title: "Лекція 2", locale: "en", theme: { preset: "dark", accent: "#112233" } });
  });

  it("некоректний формат токена — 404 без звернення до БД; present-токен — той самий 404", async () => {
    const { created, patch, db } = await setup();
    const before = db.calls.length;
    const bad = await patch("abc", { title: "x" });
    expect(bad.status).toBe(404);
    expect(db.calls.length).toBe(before);
    const present = await patch(created.presentToken, { title: "x" });
    expect(present.status).toBe(404);
    expect(await present.json()).toEqual({ error: { code: "not_found" } });
    expect(db.rows[0].title).toBe("Т");
  });

  it("невалідне тіло — 400 validation_failed", async () => {
    const { created, patch } = await setup();
    for (const body of [{ title: "  " }, { locale: "fr" }, {}, { theme: { preset: "light", accent: "red" } }]) {
      const response = await patch(created.editToken, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: { code: "validation_failed" } });
    }
  });

  it("логотип: лише URL з bucket цієї презентації", async () => {
    const { created, patch } = await setup();
    const own = `https://abcd.supabase.co/storage/v1/object/public/slide-media/${created.id}/0b7c1e0e-3c1a-4d55-9a57-2f6b1d1a2e3f.png`;
    expect((await patch(created.editToken, { theme: { preset: "light", logoUrl: "https://evil.example/x.png" } })).status).toBe(400);
    const other = own.replace(created.id, "11111111-1111-4111-8111-111111111111");
    expect((await patch(created.editToken, { theme: { preset: "light", logoUrl: other } })).status).toBe(400);
    expect((await patch(created.editToken, { theme: { preset: "light", logoUrl: own } })).status).toBe(200);
    expect((await patch(created.editToken, { theme: { preset: "light", logoUrl: null } })).status).toBe(200);
  });

  it("ConfigError — 503", async () => {
    const { created, deps, patch } = await setup();
    deps.getEnv = () => {
      throw new ConfigError(["POSTGRES_URL"]);
    };
    const response = await patch(created.editToken, { title: "Нова" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "service_unavailable" } });
  });
});
