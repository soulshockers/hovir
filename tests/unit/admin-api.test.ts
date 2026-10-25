import { describe, expect, it } from "vitest";

import { handleAdminDelete, handleAdminLogin, handleAdminLogout, handleAdminReissue } from "@/lib/admin/api";
import { ADMIN_PAGE_SIZE, listPresentations } from "@/lib/admin/service";
import { hashToken } from "@/lib/access/tokens";
import { handleCreatePresentation } from "@/lib/presentations/api";
import { createPresentation, findByToken } from "@/lib/presentations/service";

import { fakeDeps, jsonRequest, ORIGIN } from "./fakes";

const PASSWORD = "s3cret";
const protectedDeps = () => fakeDeps({ env: { INSTANCE_PASSWORD: PASSWORD } });

const login = (deps: ReturnType<typeof fakeDeps>["deps"], password: unknown, headers: Record<string, string> = { origin: ORIGIN }) =>
  handleAdminLogin(jsonRequest("/api/admin/login", { password }, { headers }), deps);

async function sessionCookie(deps: ReturnType<typeof fakeDeps>["deps"]) {
  const response = await login(deps, PASSWORD);
  return response.headers.get("set-cookie")!.split(";")[0];
}

describe("вхід і вихід", () => {
  it("404 без INSTANCE_PASSWORD", async () => {
    const { deps } = fakeDeps();
    expect((await login(deps, "будь-що")).status).toBe(404);
    expect((await handleAdminLogout(jsonRequest("/api/admin/logout", {}, { headers: { origin: ORIGIN } }), deps)).status).toBe(404);
  });

  it("успішний вхід ставить cookie з потрібними атрибутами", async () => {
    const { deps } = protectedDeps();
    const response = await login(deps, PASSWORD);
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^hovir_admin=\d+\.[A-Za-z0-9_-]{43}; /);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=43200");
    expect(cookie).toContain("Secure");
  });

  it("на HTTP без Secure", async () => {
    const { deps } = protectedDeps();
    const request = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect((await handleAdminLogin(request, deps)).headers.get("set-cookie")).not.toContain("Secure");
  });

  it("неправильний пароль — 401, після 5 невдач — 429 навіть з правильним", async () => {
    const { deps } = protectedDeps();
    const wrong = await login(deps, "nope");
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: { code: "invalid_password" } });
    for (let i = 0; i < 4; i++) await login(deps, `nope-${i}`);
    const blocked = await login(deps, PASSWORD);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("невдалі паролі під час створення рахуються спільно з /admin", async () => {
    const { deps } = protectedDeps();
    for (let i = 0; i < 5; i++) {
      await handleCreatePresentation(jsonRequest("/api/presentations", { password: `bad-${i}` }), deps);
    }
    expect((await login(deps, PASSWORD)).status).toBe(429);
  });

  it("успішні входи не витрачають ліміт", async () => {
    const { deps } = protectedDeps();
    for (let i = 0; i < 8; i++) expect((await login(deps, PASSWORD)).status).toBe(200);
  });

  it("403 з чужим чи відсутнім Origin", async () => {
    const { deps } = protectedDeps();
    expect((await login(deps, PASSWORD, { origin: "https://evil.example" })).status).toBe(403);
    expect((await login(deps, PASSWORD, {})).status).toBe(403);
    expect((await handleAdminLogout(jsonRequest("/api/admin/logout", {}, { headers: { origin: "https://evil.example" } }), deps)).status).toBe(403);
  });

  it("вихід видаляє cookie", async () => {
    const { deps } = protectedDeps();
    const response = await handleAdminLogout(jsonRequest("/api/admin/logout", {}, { headers: { origin: ORIGIN } }), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/^hovir_admin=; .*Max-Age=0/);
  });
});

describe("відновлення й видалення", () => {
  async function setup() {
    const ctx = protectedDeps();
    const created = await createPresentation(ctx.db.presentations, "Т");
    const cookie = await sessionCookie(ctx.deps);
    const call = (method: "reissue" | "delete", headers: Record<string, string>, id = created.id) =>
      method === "reissue"
        ? handleAdminReissue(jsonRequest(`/api/admin/presentations/${id}/reissue`, {}, { headers }), id, ctx.deps)
        : handleAdminDelete(jsonRequest(`/api/admin/presentations/${id}`, undefined, { method: "DELETE", headers }), id, ctx.deps);
    return { ...ctx, created, cookie, call };
  }

  it("401 без сесії й без даних презентацій", async () => {
    const { call } = await setup();
    const response = await call("reissue", { origin: ORIGIN });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "unauthorized" } });
    expect((await call("delete", { origin: ORIGIN, cookie: "hovir_admin=1.forged" })).status).toBe(401);
  });

  it("403 з чужим Origin навіть із сесією", async () => {
    const { call, cookie, db } = await setup();
    expect((await call("delete", { origin: "https://evil.example", cookie })).status).toBe(403);
    expect(db.rows).toHaveLength(1);
  });

  it("404 без INSTANCE_PASSWORD", async () => {
    const ctx = fakeDeps();
    const response = await handleAdminDelete(jsonRequest("/api/admin/presentations/x", undefined, { method: "DELETE", headers: { origin: ORIGIN } }), "x", ctx.deps);
    expect(response.status).toBe(404);
  });

  it("відновлення перевипускає обидва токени", async () => {
    const { call, cookie, created, db } = await setup();
    const response = await call("reissue", { origin: ORIGIN, cookie });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(await findByToken(db.presentations, "edit", created.editToken)).toBeNull();
    expect(await findByToken(db.presentations, "present", created.presentToken)).toBeNull();
    expect(db.rows[0].editTokenHash).toBe(hashToken(body.editToken));
    expect(db.rows[0].presentTokenHash).toBe(hashToken(body.presentToken));
  });

  it("видалення, повторне — 404, неіснуючий id — 404", async () => {
    const { call, cookie } = await setup();
    expect((await call("delete", { origin: ORIGIN, cookie })).status).toBe(204);
    expect((await call("delete", { origin: ORIGIN, cookie })).status).toBe(404);
    expect((await call("reissue", { origin: ORIGIN, cookie }, "not-a-uuid")).status).toBe(404);
  });

  it("видалення спершу прибирає файли презентації, потім рядок", async () => {
    const { call, cookie, created, db, media } = await setup();
    await media.store.upload(created.id, new Uint8Array([1]), "image/png");
    await media.store.upload("22222222-2222-4222-8222-222222222222", new Uint8Array([1]), "image/png");
    const removeCalls: string[] = [];
    const original = db.admin.delete;
    db.admin.delete = async (id) => {
      removeCalls.push(...media.calls.filter((c) => c.startsWith("remove:")));
      return original(id);
    };
    expect((await call("delete", { origin: ORIGIN, cookie })).status).toBe(204);
    expect(removeCalls).toEqual([`remove:${created.id}`]);
    expect([...media.files.keys()].some((path) => path.startsWith(created.id))).toBe(false);
    expect(media.files.size).toBe(1);
  });

  it("Storage недоступний — 503, презентація лишається", async () => {
    const { call, cookie, db, media } = await setup();
    media.state.failing = true;
    const response = await call("delete", { origin: ORIGIN, cookie });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "service_unavailable" } });
    expect(db.rows).toHaveLength(1);
  });
});

describe("список презентацій", () => {
  it("50 на сторінку, найновіші першими, без хешів", async () => {
    const { db } = fakeDeps();
    for (let i = 0; i < 120; i++) await createPresentation(db.presentations, `П${i}`);
    const first = await listPresentations(db.admin, 1);
    expect(first.items).toHaveLength(ADMIN_PAGE_SIZE);
    expect(first.items[0].title).toBe("П119");
    expect(first.pageCount).toBe(3);
    expect(Object.keys(first.items[0]).sort()).toEqual(["createdAt", "id", "title", "updatedAt"]);
    const third = await listPresentations(db.admin, 3);
    expect(third.items).toHaveLength(20);
    expect((await listPresentations(db.admin, -1)).page).toBe(1);
  });
});
