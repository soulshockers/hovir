import { afterAll, describe, expect, it } from "vitest";

import { createPresentationRepo } from "@/lib/presentations/repo";
import { createPresentation } from "@/lib/presentations/service";

import { testMediaStore } from "../support/media-cleanup";
import { cleanupTestData, hasDatabase, openTestDb, TEST_TITLE_PREFIX } from "./db";

// 1×1 PNG.
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
);

describe.skipIf(!hasDatabase)("прибирання тестових даних", () => {
  const { sql, db } = hasDatabase ? openTestDb(2) : ({} as ReturnType<typeof openTestDb>);

  afterAll(async () => {
    await cleanupTestData(sql);
    await sql.end();
  });

  it("видаляє тестову презентацію, її слайди й файли", async () => {
    const created = await createPresentation(createPresentationRepo(db), `${TEST_TITLE_PREFIX} прибирання`);
    await sql`insert into slides (presentation_id, position, plugin_id, plugin_version, config)
              values (${created.id}, 0, 'counter', 1, ${JSON.stringify({ step: 1 })}::jsonb)`;
    const url = await testMediaStore().upload(created.id, PNG, "image/png");
    expect((await fetch(url)).status).toBe(200);

    await cleanupTestData(sql);

    expect(await sql`select 1 from presentations where id = ${created.id}`).toHaveLength(0);
    expect(await sql`select 1 from slides where presentation_id = ${created.id}`).toHaveLength(0);
    const objects = await sql`select name from storage.objects where bucket_id = 'slide-media' and name like ${created.id + "/%"}`;
    expect(objects).toHaveLength(0);
  });
});
