import { describe, expect, it } from "vitest";

import { MAX_MEDIA_BYTES } from "@/lib/media/constants";
import { handleUploadMedia } from "@/lib/media/api";
import { handleCreatePresentation } from "@/lib/presentations/api";

import { fakeDeps, jsonRequest, ORIGIN } from "./fakes";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

async function setup() {
  const ctx = fakeDeps();
  const created = await (await handleCreatePresentation(jsonRequest("/api/presentations", {}), ctx.deps)).json();
  const upload = (token: string | undefined, content: Uint8Array | string | null, name = "a.png") => {
    const form = new FormData();
    if (content !== null) form.set("file", new Blob([content as BlobPart]), name);
    return handleUploadMedia(
      new Request(`${ORIGIN}/api/presentations/media`, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.7", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: form,
      }),
      ctx.deps,
    );
  };
  return { ...ctx, created, upload };
}

describe("POST /api/presentations/media", () => {
  it("зберігає PNG і повертає URL у папці презентації", async () => {
    const { created, upload, media } = await setup();
    const response = await upload(created.editToken, PNG);
    expect(response.status).toBe(201);
    const { url } = await response.json();
    expect(url).toMatch(new RegExp(`/storage/v1/object/public/slide-media/${created.id}/[0-9a-f-]{36}\\.png$`));
    expect(media.files.size).toBe(1);
  });

  it("present-токен і некоректний токен — 404, файл не збережено", async () => {
    const { created, upload, media } = await setup();
    expect((await upload(created.presentToken, PNG)).status).toBe(404);
    expect((await upload("abc", PNG)).status).toBe(404);
    expect((await upload(undefined, PNG)).status).toBe(404);
    expect(media.files.size).toBe(0);
  });

  it("понад 4 МБ — 413 (і за Content-Length до читання тіла)", async () => {
    const { created, upload, deps, media } = await setup();
    const big = new Uint8Array(MAX_MEDIA_BYTES + 1);
    big.set(PNG);
    const response = await upload(created.editToken, big);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: { code: "payload_too_large" } });

    const declared = await handleUploadMedia(
      new Request(`${ORIGIN}/api/presentations/media`, {
        method: "POST",
        headers: { authorization: `Bearer ${created.editToken}`, "content-length": String(8 * 1024 * 1024) },
      }),
      deps,
    );
    expect(declared.status).toBe(413);
    expect(media.files.size).toBe(0);
  });

  it("SVG і HTML з розширенням .png — 415", async () => {
    const { created, upload } = await setup();
    const svg = await upload(created.editToken, '<svg xmlns="http://www.w3.org/2000/svg"/>', "a.svg");
    expect(svg.status).toBe(415);
    expect(await svg.json()).toEqual({ error: { code: "unsupported_media_type" } });
    expect((await upload(created.editToken, "<html><script>1</script></html>", "a.png")).status).toBe(415);
  });

  it("без файлу — 400", async () => {
    const { created, upload } = await setup();
    expect((await upload(created.editToken, null)).status).toBe(400);
  });

  it("31-ше завантаження — 429 з Retry-After, файл не збережено", async () => {
    const { created, upload, media } = await setup();
    for (let i = 0; i < 30; i++) expect((await upload(created.editToken, PNG)).status).toBe(201);
    const response = await upload(created.editToken, PNG);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(media.files.size).toBe(30);
  });

  it("недоступний Storage — 503 без деталей", async () => {
    const { created, upload, media } = await setup();
    media.state.failing = true;
    const response = await upload(created.editToken, PNG);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "service_unavailable" } });
  });
});
