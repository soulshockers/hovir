import { readFile } from "node:fs/promises";

import { E2E_INSTANCE_PASSWORD } from "./config";
import { createViaApi, expect, test, TEST_TITLE_PREFIX } from "./fixtures";

const title = (name: string) => `${TEST_TITLE_PREFIX} ${name}`;

test.describe("головна відкритого інстансу", () => {
  test("створення: модалка з посиланнями, копіювання, .txt, запис у списку", async ({ page, context, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await expect(page.getByTestId("open-instance-warning")).toBeVisible();
    await expect(page.getByLabel("Пароль інстансу")).toHaveCount(0);
    await expect(page.getByTestId("my-presentations-empty")).toBeVisible();

    await page.getByLabel("Назва").fill(`  ${title("Лекція 1")}  `);
    await page.getByRole("button", { name: "Створити презентацію" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const editUrl = (await page.getByTestId("modal-edit-url").innerText()).trim();
    const presentUrl = (await page.getByTestId("modal-present-url").innerText()).trim();
    expect(editUrl).toMatch(new RegExp(`^${baseURL}/e/[A-Za-z0-9_-]{43}$`));
    expect(presentUrl).toMatch(new RegExp(`^${baseURL}/p/[A-Za-z0-9_-]{43}$`));

    // Клік поза модалкою та Esc її не закривають.
    await page.getByTestId("modal-backdrop").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Копіювати" }).first().click();
    await expect(dialog.getByRole("button", { name: "Скопійовано ✓" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(editUrl);

    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Завантажити .txt" }).click()]);
    const text = await readFile((await download.path())!, "utf8");
    expect(text).toContain(title("Лекція 1"));
    expect(text).toContain(editUrl);
    expect(text).toContain(presentUrl);
    expect(text).toMatch(/повний доступ/);

    await dialog.getByRole("button", { name: /закрити/ }).click();
    await expect(dialog).toHaveCount(0);
    const entry = page.getByTestId("my-presentation").filter({ hasText: title("Лекція 1") });
    await expect(entry.getByRole("link", { name: "Редагувати" })).toHaveAttribute("href", editUrl);
    await expect(entry.getByRole("link", { name: "Показати" })).toHaveAttribute("href", presentUrl);

    await page.reload();
    await expect(page.getByTestId("my-presentation").filter({ hasText: title("Лекція 1") })).toBeVisible();
  });

  test("інший браузер: порожній список, а відкрите edit-посилання додає запис", async ({ browser, request }) => {
    const created = await createViaApi(request, "Перенесення");
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByTestId("my-presentations-empty")).toContainText("лише в цьому браузері");

    await page.goto(`/e/${created.editToken}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(created.title);
    await page.goto("/");
    const entry = page.getByTestId("my-presentation").filter({ hasText: created.title });
    await expect(entry.getByRole("link", { name: "Редагувати" })).toHaveAttribute("href", new RegExp(`/e/${created.editToken}$`));
    await expect(entry.getByRole("link", { name: "Показати" })).toHaveCount(0);

    await page.goto(`/p/${created.presentToken}`);
    await page.goto("/");
    await expect(entry.getByRole("link", { name: "Показати" })).toHaveAttribute("href", new RegExp(`/p/${created.presentToken}$`));
    await context.close();
  });

  test("прибирання запису не впливає на посилання", async ({ page, request }) => {
    const created = await createViaApi(request, "Прибирання");
    await page.goto(`/e/${created.editToken}`);
    await page.goto("/");
    const entry = page.getByTestId("my-presentation").filter({ hasText: created.title });
    await entry.getByRole("button", { name: "Прибрати зі списку" }).click();
    await expect(entry).toHaveCount(0);
    expect((await page.goto(`/e/${created.editToken}`))?.status()).toBe(200);
  });

  test("заблокований localStorage не заважає створенню", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Доступ заборонено", "SecurityError");
        },
      });
    });
    await page.goto("/");
    await expect(page.getByTestId("storage-unavailable")).toBeVisible();
    await page.getByLabel("Назва").fill(title("Без сховища"));
    await page.getByRole("button", { name: "Створити презентацію" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("modal-edit-url")).toContainText("/e/");
    await expect(page.getByTestId("storage-unavailable")).toBeVisible();
  });

  test("11-те створення за вікно показує повідомлення про ліміт", async ({ page, request }) => {
    for (let i = 0; i < 10; i++) await createViaApi(request, `ліміт ${i}`);
    await page.goto("/");
    await page.getByLabel("Назва").fill(title("одинадцята"));
    await page.getByRole("button", { name: "Створити презентацію" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Забагато спроб" })).toContainText(/через \d+ (с|хв)/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("головна захищеного інстансу", { tag: "@protected" }, () => {
  test("поле пароля, без попередження; неправильний пароль — помилка", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("open-instance-warning")).toHaveCount(0);
    await page.getByLabel("Назва").fill(title("Захищена"));
    await page.getByLabel("Пароль інстансу").fill("wrong-password");
    await page.getByRole("button", { name: "Створити презентацію" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Неправильний пароль інстансу" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByLabel("Пароль інстансу").fill(E2E_INSTANCE_PASSWORD);
    await page.getByRole("button", { name: "Створити презентацію" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("API без пароля — 401 password_required", async ({ request }) => {
    const response = await request.post("/api/presentations", { data: { title: title("без пароля") } });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "password_required" } });
  });
});

test.describe("форма створення до гідратації", () => {
  test("без JS поля й кнопка неактивні", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByLabel("Назва")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Створити презентацію" })).toBeDisabled();
    await context.close();
  });

  test("створення одразу після переходу спрацьовує з першого разу", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    await page.getByLabel("Назва").fill(title("Одразу"));
    await page.getByRole("button", { name: "Створити презентацію" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
