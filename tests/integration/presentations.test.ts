import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashToken } from "@/lib/access/tokens";
import { createPresentationRepo } from "@/lib/presentations/repo";
import { createPresentation, findByToken, reissueToken } from "@/lib/presentations/service";

import { cleanupTestData, hasDatabase, openTestDb, TEST_TITLE_PREFIX } from "./db";

describe.skipIf(!hasDatabase)("презентації в Postgres", () => {
  const { sql, db } = hasDatabase ? openTestDb() : ({} as ReturnType<typeof openTestDb>);
  const repo = hasDatabase ? createPresentationRepo(db) : undefined!;
  const title = `${TEST_TITLE_PREFIX} інтеграція`;

  beforeEach(() => cleanupTestData(sql));
  afterAll(async () => {
    await cleanupTestData(sql);
    await sql.end();
  });

  it("у рядку БД лише SHA-256 хеші, без сирих токенів", async () => {
    const created = await createPresentation(repo, title);
    const [row] = await sql`select * from presentations where id = ${created.id}`;
    expect(row.edit_token_hash).toBe(hashToken(created.editToken));
    expect(row.present_token_hash).toBe(hashToken(created.presentToken));
    expect(row.theme).toEqual({ preset: "light" });
    expect(row.locale).toBe("auto");
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(created.editToken);
    expect(serialized).not.toContain(created.presentToken);
  });

  it("чотири токени двох презентацій різні", async () => {
    const a = await createPresentation(repo, title);
    const b = await createPresentation(repo, title);
    expect(new Set([a.editToken, a.presentToken, b.editToken, b.presentToken]).size).toBe(4);
  });

  it("з двох паралельних перевипусків edit-токена успішний лише один", async () => {
    const created = await createPresentation(repo, title);
    const results = await Promise.all([reissueToken(repo, created.editToken, "edit"), reissueToken(repo, created.editToken, "edit")]);
    const winners = results.filter((r) => r !== null);
    expect(winners).toHaveLength(1);
    expect(await findByToken(repo, "edit", created.editToken)).toBeNull();
    expect(await findByToken(repo, "edit", winners[0]!.token)).toMatchObject({ id: created.id });
  });
});

describe.skipIf(!hasDatabase)("майстер-доступ у Postgres", async () => {
  const { createAdminRepo } = await import("@/lib/admin/repo");
  const { deletePresentation, listPresentations, restoreLinks } = await import("@/lib/admin/service");
  const { sql, db } = hasDatabase ? openTestDb(2) : ({} as ReturnType<typeof openTestDb>);
  const repo = hasDatabase ? createPresentationRepo(db) : undefined!;
  const admin = hasDatabase ? createAdminRepo(db) : undefined!;

  beforeEach(() => cleanupTestData(sql));
  afterAll(async () => {
    await cleanupTestData(sql);
    await sql.end();
  });

  it("список без хешів; відновлення й видалення", async () => {
    const created = await createPresentation(repo, `${TEST_TITLE_PREFIX} адмін`);
    const page = await listPresentations(admin, 1);
    const item = page.items.find((i) => i.id === created.id)!;
    expect(Object.keys(item).sort()).toEqual(["createdAt", "id", "title", "updatedAt"]);

    const restored = await restoreLinks(admin, created.id);
    expect(await findByToken(repo, "edit", created.editToken)).toBeNull();
    expect(await findByToken(repo, "present", restored!.presentToken)).toMatchObject({ id: created.id });

    expect(await deletePresentation(admin, created.id)).toBe(true);
    expect(await deletePresentation(admin, created.id)).toBe(false);
    expect(await findByToken(repo, "edit", restored!.editToken)).toBeNull();
  });
});
