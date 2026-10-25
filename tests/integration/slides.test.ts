import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createRegistry } from "@/lib/plugins/registry";
import { createPresentationRepo } from "@/lib/presentations/repo";
import { createPresentation } from "@/lib/presentations/service";
import { createSlideRepo } from "@/lib/slides/repo";
import { createSlide, deleteSlide, duplicateSlide, reorderSlides, saveSlideConfig } from "@/lib/slides/service";

import { counterPlugin, guessPlugin } from "../unit/plugin-fixtures";
import { cleanupTestData, hasDatabase, openTestDb, TEST_TITLE_PREFIX } from "./db";

const registry = createRegistry([counterPlugin, guessPlugin]);

describe.skipIf(!hasDatabase)("слайди в Postgres", () => {
  const { sql, db } = hasDatabase ? openTestDb() : ({} as ReturnType<typeof openTestDb>);
  const repo = hasDatabase ? createSlideRepo(db) : undefined!;
  const presentations = hasDatabase ? createPresentationRepo(db) : undefined!;

  const newPresentation = () => createPresentation(presentations, `${TEST_TITLE_PREFIX} слайди`);
  const add = async (presentationId: string, afterSlideId?: string) => {
    const result = await createSlide(repo, registry, presentationId, { pluginId: "counter", afterSlideId });
    if (!result.ok) throw new Error(result.code);
    return result.value.slide.id;
  };
  const positions = async (presentationId: string) =>
    (await sql<{ id: string; position: number }[]>`select id, position from slides where presentation_id = ${presentationId} order by position`);

  beforeEach(() => cleanupTestData(sql));
  afterAll(async () => {
    await cleanupTestData(sql);
    await sql.end();
  });

  it("CRUD і перестановка зберігають позиції 0..n−1", async () => {
    const { id } = await newPresentation();
    const a = await add(id);
    const b = await add(id);
    const c = await add(id);
    const d = await add(id, a);
    expect((await positions(id)).map((r) => r.id)).toEqual([a, d, b, c]);

    const copy = await duplicateSlide(repo, id, b);
    if (!copy.ok) throw new Error(copy.code);
    await deleteSlide(repo, id, a);
    await reorderSlides(repo, id, [c, d, b, copy.value.slide.id]);
    const rows = await positions(id);
    expect(rows.map((r) => r.id)).toEqual([c, d, b, copy.value.slide.id]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3]);
    expect(await reorderSlides(repo, id, [c, d])).toEqual({ ok: false, code: "conflict" });
  });

  it("20 паралельних мутацій лишають послідовні позиції", async () => {
    const { id } = await newPresentation();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(await add(id));
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        if (i % 4 === 0) return add(id, ids[i % ids.length]);
        if (i % 4 === 1) return duplicateSlide(repo, id, ids[0]);
        if (i % 4 === 2) return deleteSlide(repo, id, ids[(i % 5) + 1]);
        return repo.list(id).then((list) => reorderSlides(repo, id, list.map((s) => s.id).reverse()));
      }),
    );
    const rows = await positions(id);
    expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i));
  });

  it("слайд старої версії після збереження має поточну", async () => {
    const { id } = await newPresentation();
    const [row] = await sql<{ id: string }[]>`
      insert into slides (presentation_id, position, plugin_id, plugin_version, config)
      values (${id}, 0, 'guess-number', 1, ${JSON.stringify({ range: 50 })}::jsonb) returning id`;
    const saved = await saveSlideConfig(repo, registry, id, row.id, { min: 1, max: 50, durationSec: 20 });
    expect(saved.ok).toBe(true);
    const [stored] = await sql`select plugin_version, config from slides where id = ${row.id}`;
    expect(stored).toEqual({ plugin_version: 2, config: { min: 1, max: 50, durationSec: 20 } });
  });

  it("видалення презентації каскадно видаляє слайди", async () => {
    const { id } = await newPresentation();
    await add(id);
    await add(id);
    await sql`delete from presentations where id = ${id}`;
    expect(await sql`select 1 from slides where presentation_id = ${id}`).toHaveLength(0);
  });

  it("anon-ключ через Supabase API не бачить слайдів", async () => {
    const { id } = await newPresentation();
    await add(id);
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data } = await anon.from("slides").select("*");
    expect(data ?? []).toHaveLength(0);
  });
});
