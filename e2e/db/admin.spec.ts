import type { Page } from "@playwright/test";

import { E2E_INSTANCE_PASSWORD } from "./config";
import { createViaApi, expect, test, TEST_TITLE_PREFIX } from "./fixtures";

const SOME_ID = "00000000-0000-4000-8000-000000000000";

async function adminLogin(page: Page, password = E2E_INSTANCE_PASSWORD) {
  await page.goto("/admin");
  await page.getByLabel("Пароль інстансу").fill(password);
  await page.getByRole("button", { name: "Увійти" }).click();
}

test.describe("майстер-доступ на відкритому інстансі", () => {
  test("/admin вимкнено, API — 404", async ({ page, request, baseURL }) => {
    await page.goto("/admin");
    await expect(page.getByTestId("admin-disabled")).toContainText("INSTANCE_PASSWORD");
    await expect(page.getByLabel("Пароль інстансу")).toHaveCount(0);

    const headers = { origin: baseURL! };
    expect((await request.post("/api/admin/login", { headers, data: { password: "x" } })).status()).toBe(404);
    expect((await request.delete(`/api/admin/presentations/${SOME_ID}`, { headers })).status()).toBe(404);
    expect((await request.post(`/api/admin/presentations/${SOME_ID}/reissue`, { headers })).status()).toBe(404);
  });
});

test.describe("майстер-доступ на захищеному інстансі", { tag: "@protected" }, () => {
  test("вхід, сесія без повторного пароля, вихід", async ({ page }) => {
    await adminLogin(page, "wrong-password");
    await expect(page.getByRole("alert").filter({ hasText: "Неправильний пароль" })).toBeVisible();

    await adminLogin(page);
    await expect(page.getByTestId("admin-total")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("admin-total")).toBeVisible();
    await expect(page.getByLabel("Пароль інстансу")).toHaveCount(0);

    await page.getByRole("button", { name: "Вийти" }).click();
    await expect(page.getByLabel("Пароль інстансу")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Пароль інстансу")).toBeVisible();
  });

  test("API без сесії — 401", async ({ request, baseURL }) => {
    const response = await request.delete(`/api/admin/presentations/${SOME_ID}`, { headers: { origin: baseURL! } });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "unauthorized" } });
  });

  test("відновлення посилань: попередження, нові посилання, старі — 404", async ({ page, request }) => {
    const created = await createViaApi(request, "Відновлення", E2E_INSTANCE_PASSWORD);
    await adminLogin(page);
    const item = page.getByTestId("admin-item").filter({ hasText: created.title });
    await item.getByRole("button", { name: "Відновити посилання" }).click();
    await expect(item.getByRole("alertdialog")).toContainText("перестануть діяти");
    await item.getByRole("button", { name: "Так, відновити" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Нові посилання");
    const editUrl = (await page.getByTestId("modal-edit-url").innerText()).trim();
    const presentUrl = (await page.getByTestId("modal-present-url").innerText()).trim();
    await dialog.getByRole("button", { name: /закрити/ }).click();

    await expect(dialog).toHaveCount(0);
    // Чекаємо на оновлений список, щоб не змагатися з `router.refresh()`.
    await expect(item.getByRole("button", { name: "Відновити посилання" })).toBeVisible();
    expect((await request.get(`/e/${created.editToken}`)).status()).toBe(404);
    expect((await request.get(`/p/${created.presentToken}`)).status()).toBe(404);
    expect((await request.get(editUrl)).status()).toBe(200);
    expect((await request.get(presentUrl)).status()).toBe(200);
  });

  test("видалення: зникає зі списку, посилання — 404", async ({ page, request }) => {
    const created = await createViaApi(request, "Видалення", E2E_INSTANCE_PASSWORD);
    await adminLogin(page);
    const item = page.getByTestId("admin-item").filter({ hasText: created.title });
    await item.getByRole("button", { name: "Видалити" }).click();
    await expect(item.getByRole("alertdialog")).toContainText("остаточно");
    await item.getByRole("button", { name: "Так, видалити" }).click();
    await expect(item).toHaveCount(0);

    expect((await page.goto(`/e/${created.editToken}`))?.status()).toBe(404);
    expect((await page.goto(`/p/${created.presentToken}`))?.status()).toBe(404);
  });

  test("DELETE з чужим Origin — 403, презентацію не видалено", async ({ page, request, sql }) => {
    const created = await createViaApi(request, "CSRF", E2E_INSTANCE_PASSWORD);
    await adminLogin(page);
    await expect(page.getByTestId("admin-total")).toBeVisible();
    const response = await page.request.delete(`/api/admin/presentations/${created.id}`, { headers: { origin: "https://evil.example" } });
    expect(response.status()).toBe(403);
    expect(await sql`select 1 from presentations where id = ${created.id}`).toHaveLength(1);
  });

  test("5 невдалих паролів через створення блокують вхід у /admin", async ({ page, request }) => {
    for (let i = 0; i < 5; i++) {
      const response = await request.post("/api/presentations", { data: { title: `${TEST_TITLE_PREFIX} x`, password: `bad-${i}` } });
      expect(response.status()).toBe(401);
    }
    await adminLogin(page);
    await expect(page.getByRole("alert").filter({ hasText: "Забагато спроб" })).toBeVisible();
    await expect(page.getByTestId("admin-total")).toHaveCount(0);
  });

  test("пагінація по 50, найновіші першими", async ({ page, sql }) => {
    await sql`
      insert into presentations (title, edit_token_hash, present_token_hash, created_at, updated_at)
      select ${TEST_TITLE_PREFIX} || ' пагінація ' || lpad(i::text, 2, '0'),
             md5(random()::text || i || 'e'), md5(random()::text || i || 'p'),
             now() + interval '1 day' + i * interval '1 second', now()
      from generate_series(1, 51) as i`;
    await adminLogin(page);
    const items = page.getByTestId("admin-item");
    await expect(items).toHaveCount(50);
    await expect(items.first()).toContainText(`${TEST_TITLE_PREFIX} пагінація 51`);
    await page.getByRole("link", { name: "Старіші →" }).click();
    await expect(page).toHaveURL(/\/admin\?page=2$/);
    await expect(page.getByTestId("admin-item").first()).toContainText(`${TEST_TITLE_PREFIX} пагінація 01`);
  });
});
