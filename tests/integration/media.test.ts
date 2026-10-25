import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ADMIN_COOKIE, createAdminSession } from "@/lib/access/admin-session";
import { handleAdminDelete } from "@/lib/admin/api";
import { defaultApiDeps } from "@/lib/http/default-deps";
import type { ApiDeps } from "@/lib/http/deps";
import { handleUploadMedia } from "@/lib/media/api";
import { MEDIA_BUCKET } from "@/lib/media/constants";
import { createPresentationRepo } from "@/lib/presentations/repo";
import { createPresentation } from "@/lib/presentations/service";

import { cleanupTestData, hasDatabase, openTestDb, testClientKey, TEST_TITLE_PREFIX } from "./db";

// Медіа в dev-проєкті Supabase: справжні Storage і Postgres через `defaultApiDeps`.

const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
);
const IP = "198.51.100.60";
const ORIGIN = "http://localhost";
const PASSWORD = "integration-password";

describe.skipIf(!hasDatabase)("медіа в Supabase Storage", () => {
  const { sql, db } = hasDatabase ? openTestDb(2) : ({} as ReturnType<typeof openTestDb>);
  const anon = hasDatabase
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    : undefined!;
  const keys = [testClientKey(IP)];

  const upload = (token: string) => {
    const form = new FormData();
    form.set("file", new Blob([PNG]), "pixel.png");
    return handleUploadMedia(
      new Request(`${ORIGIN}/api/presentations/media`, { method: "POST", headers: { authorization: `Bearer ${token}`, "x-real-ip": IP }, body: form }),
      defaultApiDeps,
    );
  };

  beforeEach(() => cleanupTestData(sql, keys));
  afterAll(async () => {
    await cleanupTestData(sql, keys);
    await sql.end();
  });

  it("завантаження дає публічний URL, що читається без токена", async () => {
    const created = await createPresentation(createPresentationRepo(db), `${TEST_TITLE_PREFIX} медіа`);
    const response = await upload(created.editToken);
    expect(response.status).toBe(201);
    const { url } = await response.json();
    expect(url).toContain(`/storage/v1/object/public/${MEDIA_BUCKET}/${created.id}/`);
    const image = await fetch(url);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
  });

  it("anon-ключ не може записати файл чи переглянути вміст bucket", async () => {
    const created = await createPresentation(createPresentationRepo(db), `${TEST_TITLE_PREFIX} медіа`);
    expect((await upload(created.editToken)).status).toBe(201);
    const write = await anon.storage.from(MEDIA_BUCKET).upload(`${created.id}/anon.png`, PNG, { contentType: "image/png" });
    expect(write.error).not.toBeNull();
    const list = await anon.storage.from(MEDIA_BUCKET).list(created.id);
    expect(list.data ?? []).toHaveLength(0);
  });

  it("видалення презентації власником прибирає її файли", async () => {
    const created = await createPresentation(createPresentationRepo(db), `${TEST_TITLE_PREFIX} медіа`);
    expect((await upload(created.editToken)).status).toBe(201);
    expect((await upload(created.editToken)).status).toBe(201);

    const env = { ...defaultApiDeps.getEnv(), INSTANCE_PASSWORD: PASSWORD };
    const deps: ApiDeps = { ...defaultApiDeps, getEnv: () => env };
    const cookie = `${ADMIN_COOKIE}=${createAdminSession(PASSWORD, new Date()).value}`;
    const response = await handleAdminDelete(
      new Request(`${ORIGIN}/api/admin/presentations/${created.id}`, { method: "DELETE", headers: { origin: ORIGIN, cookie } }),
      created.id,
      deps,
    );
    expect(response.status).toBe(204);
    expect(await sql`select 1 from presentations where id = ${created.id}`).toHaveLength(0);
    expect(await sql`select name from storage.objects where bucket_id = ${MEDIA_BUCKET} and name like ${created.id + "/%"}`).toHaveLength(0);
  });
});
