import { describe, expect, it } from "vitest";

import { uiErrorFromResponse } from "@/lib/http/messages";
import { handleCreatePresentation } from "@/lib/presentations/api";
import {
  handleCreateSlide,
  handleDeleteSlide,
  handleDuplicateSlide,
  handleReorderSlides,
  handleSaveSlide,
} from "@/lib/slides/api";

import { fakeDeps, jsonRequest } from "./fakes";

async function setup() {
  const ctx = fakeDeps();
  const create = async () => (await handleCreatePresentation(jsonRequest("/api/presentations", { title: "Т" }), ctx.deps)).json();
  const a = await create();
  const b = await create();
  const req = (token: string | undefined, path: string, body: unknown, method = "POST") =>
    jsonRequest(path, body, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const add = async (token: string, body: unknown) => handleCreateSlide(req(token, "/api/presentations/slides", body), ctx.deps);
  const save = (token: string, id: string, config: unknown) =>
    handleSaveSlide(req(token, `/api/presentations/slides/${id}`, { config }, "PUT"), id, ctx.deps);
  return { ...ctx, a, b, req, add, save };
}

describe("API слайдів", () => {
  it("створює, дублює, переставляє й видаляє", async () => {
    const { a, add, req, deps, slides } = await setup();
    const created = await add(a.editToken, { pluginId: "counter" });
    expect(created.status).toBe(201);
    const { slide } = await created.json();
    expect(slide).toMatchObject({ pluginId: "counter", pluginVersion: 1, config: { step: 1 }, position: 0 });

    const dup = await handleDuplicateSlide(req(a.editToken, `/api/presentations/slides/${slide.id}/duplicate`, undefined), slide.id, deps);
    expect(dup.status).toBe(201);
    const { order } = await dup.json();
    expect(order).toHaveLength(2);

    const reorder = await handleReorderSlides(req(a.editToken, "/api/presentations/slides/order", { ids: [...order].reverse() }, "PUT"), deps);
    expect(reorder.status).toBe(204);
    expect((await slides.repo.list(a.id)).map((s) => s.id)).toEqual([...order].reverse());

    const del = await handleDeleteSlide(req(a.editToken, `/api/presentations/slides/${slide.id}`, undefined, "DELETE"), slide.id, deps);
    expect(del.status).toBe(204);
    expect(await slides.repo.list(a.id)).toHaveLength(1);
  });

  it("present-токен, некоректний токен і некоректний UUID — 404 без змін", async () => {
    const { a, add, save, db } = await setup();
    const { slide } = await (await add(a.editToken, { pluginId: "counter" })).json();
    expect((await add(a.presentToken, { pluginId: "counter" })).status).toBe(404);
    const before = db.calls.length;
    expect((await add("abc", { pluginId: "counter" })).status).toBe(404);
    expect((await save(a.editToken, "not-a-uuid", { step: 2 })).status).toBe(404);
    expect(db.calls.length).toBe(before);
    const present = await save(a.presentToken, slide.id, { step: 2 });
    expect(present.status).toBe(404);
    expect(await present.json()).toEqual({ error: { code: "not_found" } });
  });

  it("слайд іншої презентації — 404", async () => {
    const { a, b, add, save, req, deps, slides } = await setup();
    const { slide } = await (await add(a.editToken, { pluginId: "counter" })).json();
    expect((await save(b.editToken, slide.id, { step: 9 })).status).toBe(404);
    expect((await handleDeleteSlide(req(b.editToken, "/x", undefined, "DELETE"), slide.id, deps)).status).toBe(404);
    expect((await handleDuplicateSlide(req(b.editToken, "/x", undefined), slide.id, deps)).status).toBe(404);
    expect((await slides.repo.list(a.id))[0].config).toEqual({ step: 1 });
  });

  it("невідомий плагін — 400 unknown_plugin; конфіг поза схемою — 400 validation_failed", async () => {
    const { a, add, save } = await setup();
    const unknown = await add(a.editToken, { pluginId: "poll" });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: { code: "unknown_plugin" } });
    const { slide } = await (await add(a.editToken, { pluginId: "counter" })).json();
    const bad = await save(a.editToken, slide.id, { step: 0 });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: { code: "validation_failed" } });
    const good = await save(a.editToken, slide.id, { step: 3 });
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ id: slide.id, pluginVersion: 1 });
  });

  it("застарілий порядок і слайд новішої версії — 409", async () => {
    const { a, add, req, deps, save, slides } = await setup();
    const { slide } = await (await add(a.editToken, { pluginId: "counter" })).json();
    await add(a.editToken, { pluginId: "counter" });
    const stale = await handleReorderSlides(req(a.editToken, "/x", { ids: [slide.id] }, "PUT"), deps);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: { code: "conflict" } });

    slides.rows.find((row) => row.id === slide.id)!.pluginVersion = 5;
    const locked = await save(a.editToken, slide.id, { step: 2 });
    expect(locked.status).toBe(409);
    expect(await locked.json()).toEqual({ error: { code: "slide_locked" } });
  });

  it("зображення в конфігу — лише з bucket цієї презентації", async () => {
    const { a, b, add, save } = await setup();
    const { slide } = await (await add(a.editToken, { pluginId: "editor-sample" })).json();
    const url = (id: string) => `https://abcd.supabase.co/storage/v1/object/public/slide-media/${id}/0b7c1e0e-3c1a-4d55-9a57-2f6b1d1a2e3f.png`;
    const withImage = (image: string | null) => ({ ...slide.config, image });
    expect((await save(a.editToken, slide.id, withImage("https://evil.example/pixel.png"))).status).toBe(400);
    expect((await save(a.editToken, slide.id, withImage(url(b.id)))).status).toBe(400);
    expect((await save(a.editToken, slide.id, withImage(url(a.id)))).status).toBe(200);
    expect((await save(a.editToken, slide.id, withImage(null))).status).toBe(200);
  });

  it("помилка БД — 503 без деталей", async () => {
    const { a, add, deps } = await setup();
    deps.slides = () => ({
      list: async () => [],
      withPresentation: async () => {
        throw Object.assign(new Error("connect ECONNREFUSED 10.0.0.1"), { code: "ECONNREFUSED" });
      },
    });
    const response = await add(a.editToken, { pluginId: "counter" });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("ECONNREFUSED");
  });

  it("тексти помилок для UI", async () => {
    const message = async (code: string) => (await uiErrorFromResponse(Response.json({ error: { code } }, { status: 400 }))).message;
    expect(await message("validation_failed")).not.toContain("120");
    expect(await message("slide_locked")).toContain("новішою версією");
    expect(await message("payload_too_large")).toContain("4 МБ");
  });
});
