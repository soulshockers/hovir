import type { Page } from "@playwright/test";

import { createViaApi, expect, test } from "./fixtures";

/** Панель «Посилання» редактора (перевипуск посилань). */
async function openLinks(page: Page) {
  await page.getByRole("button", { name: "Посилання", exact: true }).click();
  await expect(page.getByTestId("links-dialog")).toBeVisible();
}

test.describe("доступ за edit- і present-посиланнями", () => {
  test("валідні /e і /p показують назву, /p — без перевипуску", async ({ page, request }) => {
    const created = await createViaApi(request, "Лекція доступу");

    const edit = await page.goto(`/e/${created.editToken}`);
    expect(edit?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(created.title);
    await openLinks(page);
    await expect(page.getByRole("button", { name: "Перевипустити present-посилання" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Перевипустити edit-посилання" })).toBeVisible();
    await expect(page.getByTestId("present-unknown")).toBeVisible();

    const present = await page.goto(`/p/${created.presentToken}`);
    expect(present?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(created.title);
    await expect(page.getByRole("button", { name: /Перевипустити/ })).toHaveCount(0);
  });

  test("невалідні токени дають однаковий 404", async ({ page, request }) => {
    const created = await createViaApi(request);
    const random = "A".repeat(43);
    const bodies: string[] = [];
    for (const path of [`/e/${created.presentToken}`, "/p/abc", `/p/${random}`, `/e/${random}`]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      bodies.push(await page.locator("body").innerText());
    }
    expect(new Set(bodies).size).toBe(1);
  });

  test("перевипуск present-посилання: старе — 404, нове працює", async ({ page, request }) => {
    const created = await createViaApi(request);
    await page.goto(`/e/${created.editToken}`);
    await openLinks(page);
    await page.getByRole("button", { name: "Перевипустити present-посилання" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("перестане діяти");
    await page.getByRole("button", { name: "Так, перевипустити" }).click();

    const presentUrl = page.getByTestId("present-url");
    await expect(presentUrl).toContainText("/p/");
    const fresh = (await presentUrl.innerText()).trim();
    expect(fresh).not.toContain(created.presentToken);

    expect((await page.goto(`/p/${created.presentToken}`))?.status()).toBe(404);
    expect((await page.goto(fresh))?.status()).toBe(200);
  });

  test("перевипуск edit-посилання переводить на нове /e, старе — 404", async ({ page, request }) => {
    const created = await createViaApi(request);
    await page.goto(`/e/${created.editToken}`);
    await openLinks(page);
    await page.getByRole("button", { name: "Перевипустити edit-посилання" }).click();
    await page.getByRole("button", { name: "Так, перевипустити" }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/e/") && !url.pathname.endsWith(created.editToken));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(created.title);

    expect((await page.goto(`/e/${created.editToken}`))?.status()).toBe(404);
  });

  test("заголовки гігієни на /e", async ({ request }) => {
    const created = await createViaApi(request);
    const response = await request.get(`/e/${created.editToken}`);
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(response.headers()["cache-control"]).toContain("private");
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
});

test.describe("керування посиланнями до гідратації", () => {
  test("без JS кнопка «Посилання» неактивна", async ({ browser, request, baseURL }) => {
    const created = await createViaApi(request);
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto(`/e/${created.editToken}`);
    await expect(page.getByRole("button", { name: "Посилання", exact: true })).toBeDisabled();
    await context.close();
  });

  test("клік одразу після переходу спрацьовує з першого разу", async ({ page, request }) => {
    const created = await createViaApi(request);
    await page.goto(`/e/${created.editToken}`, { waitUntil: "commit" });
    await openLinks(page);
    await page.getByRole("button", { name: "Перевипустити present-посилання" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("перестане діяти");
  });
});
