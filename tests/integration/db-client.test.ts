import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { getDb, resetDb, withDbDeadline } from "@/lib/db/client";
import { TimeoutError } from "@/lib/db/errors";

import { hasDatabase } from "./db";

// Регресія: один застряглий запит на спільному клієнті не має вішати інші запити екземпляра.
describe.skipIf(!hasDatabase)("стійкий getDb()", () => {
  afterAll(() => resetDb());

  it("застряглий запит обривається дедлайном, паралельні й наступні запити виконуються", async () => {
    const stuck = withDbDeadline(() => getDb().execute(sql`select pg_sleep(5)`), 1500);
    const parallel = await Promise.all(
      Array.from({ length: 5 }, () => withDbDeadline(() => getDb().execute(sql`select 1 as ok`), 10_000)),
    );
    expect(parallel.every((rows) => rows[0]?.ok === 1)).toBe(true);
    await expect(stuck).rejects.toBeInstanceOf(TimeoutError);

    const after = await withDbDeadline(() => getDb().execute(sql`select 1 as ok`), 10_000);
    expect(after[0]?.ok).toBe(1);
  });
});
