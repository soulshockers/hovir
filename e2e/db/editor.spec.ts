import type { Locator, Page } from "@playwright/test";

import { createViaApi, expect, test, TEST_TITLE_PREFIX, type Created } from "./fixtures";

// Редактор на збірці з фікстурним плагіном `editor-sample` (HOVIR_TEST_PLUGINS=1, див. playwright.config.ts).

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function openEditor(page: Page, created: Created) {
  await page.goto(`/e/${created.editToken}`);
  await expect(page.getByRole("button", { name: "+ Додати слайд" })).toBeEnabled();
}

async function addSample(page: Page) {
  const count = await page.getByTestId("slide-item").count();
  await page.getByRole("button", { name: "+ Додати слайд" }).click();
  await page.getByTestId("add-editor-sample").click();
  await expect(page.getByTestId("slide-item")).toHaveCount(count + 1);
}

const slideIds = (page: Page) => page.getByTestId("slide-item").evaluateAll((items) => items.map((item) => item.getAttribute("data-slide-id")));
const saved = (page: Page) => expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved");
const form = (page: Page) => page.getByTestId("slide-settings");
const field = (page: Page, key: string): Locator => form(page).getByTestId(`field-${key}`);

test.describe("редактор", () => {
  test("контроли неактивні до гідратації й активні після", async ({ browser, page, request, baseURL }) => {
    const created = await createViaApi(request, "гідратація");
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const noJs = await context.newPage();
    await noJs.goto(`/e/${created.editToken}`);
    await expect(noJs.getByRole("heading", { level: 1 })).toHaveText(created.title);
    await expect(noJs.getByRole("button", { name: "+ Додати слайд" })).toBeDisabled();
    await expect(noJs.getByRole("button", { name: "Налаштування", exact: true })).toBeDisabled();
    await context.close();

    await openEditor(page, created);
    await expect(page.getByRole("button", { name: "Налаштування", exact: true })).toBeEnabled();
  });

  test("на вузькому екрані — вкладки", async ({ page, request }) => {
    const created = await createViaApi(request, "вкладки");
    await page.setViewportSize({ width: 390, height: 800 });
    await openEditor(page, created);
    await addSample(page);
    await expect(page.getByRole("region", { name: "Налаштування слайда" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Список слайдів" })).toBeHidden();
    await page.getByRole("button", { name: "Превʼю" }).click();
    await expect(page.getByTestId("slide-preview")).toBeVisible();
    await page.getByRole("button", { name: "Слайди" }).click();
    await expect(page.getByTestId("slide-list")).toBeVisible();
  });

  test("додавання, перестановка, дублювання й видалення зберігаються", async ({ page, request, sql }) => {
    const created = await createViaApi(request, "слайди");
    await openEditor(page, created);
    for (let i = 0; i < 3; i++) await addSample(page);
    const [a, b, c] = await slideIds(page);

    // Третій на перше місце клавіатурою за ручкою перетягування.
    await page.getByRole("button", { name: `Слайд 3: Тестовий слайд` }).click();
    const handle = page.getByRole("button", { name: "Перетягнути слайд 3" });
    await handle.focus();
    // dnd-kit між натисканнями вимірює позиції й анімує перенесення.
    for (const key of ["Space", "ArrowUp", "ArrowUp", "Space"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
    }
    await expect.poll(() => slideIds(page)).toEqual([c, a, b]);

    // Кнопкою «Вниз»: вибраний (c) стає другим.
    await page.getByRole("button", { name: "Перемістити слайд 1 вниз" }).click();
    await expect.poll(() => slideIds(page)).toEqual([a, c, b]);
    await expect
      .poll(async () => (await sql`select id from slides where presentation_id = ${created.id} order by position`).map((r) => r.id))
      .toEqual([a, c, b]);

    // Дублювання: копія одразу після оригіналу.
    await page.getByRole("button", { name: "Дублювати" }).click();
    await expect(page.getByTestId("slide-item")).toHaveCount(4);
    const afterDuplicate = await slideIds(page);
    expect(afterDuplicate[0]).toBe(a);
    expect(afterDuplicate[1]).toBe(c);
    expect(afterDuplicate[3]).toBe(b);

    // Видалення: скасування лишає слайд, підтвердження — видаляє.
    await page.getByRole("button", { name: "Видалити", exact: true }).click();
    await page.getByTestId("confirm-delete").getByRole("button", { name: "Скасувати" }).click();
    await expect(page.getByTestId("slide-item")).toHaveCount(4);
    await page.getByRole("button", { name: "Видалити", exact: true }).click();
    await page.getByTestId("confirm-delete").getByRole("button", { name: "Видалити" }).click();
    await expect(page.getByTestId("slide-item")).toHaveCount(3);
    const finalOrder = await slideIds(page);

    await page.reload();
    await expect(page.getByTestId("slide-item")).toHaveCount(3);
    expect(await slideIds(page)).toEqual(finalOrder);
    const positions = await sql`select position from slides where presentation_id = ${created.id} order by position`;
    expect(positions.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  test("перестановка застарілого списку: конфлікт і перечитування з сервера", async ({ page, request }) => {
    const created = await createViaApi(request, "конфлікт");
    await openEditor(page, created);
    await addSample(page);
    await addSample(page);
    // Інша вкладка додає слайд.
    const other = await request.post("/api/presentations/slides", {
      headers: { authorization: `Bearer ${created.editToken}` },
      data: { pluginId: "editor-sample" },
    });
    expect(other.status()).toBe(201);
    await page.getByRole("button", { name: "Перемістити слайд 2 вгору" }).click();
    await expect(page.getByTestId("slide-item")).toHaveCount(3);
    await expect(page.getByTestId("action-error")).toHaveCount(0);
  });

  test("слайд невідомого типу показано окремо", async ({ page, request, sql }) => {
    const created = await createViaApi(request, "невідомий");
    await sql`insert into slides (presentation_id, position, plugin_id, plugin_version, config)
              values (${created.id}, 0, 'removed-plugin', 1, ${JSON.stringify({ x: 1 })}::jsonb)`;
    await openEditor(page, created);
    await expect(page.getByTestId("slide-status")).toHaveText("Невідомий тип слайда");
    await expect(page.getByTestId("slide-status-message")).toContainText("removed-plugin");
    await expect(page.getByTestId("config-form")).toHaveCount(0);
  });

  test("превʼю оновлюється одразу, до збереження", async ({ page, request }) => {
    const created = await createViaApi(request, "превʼю");
    await openEditor(page, created);
    await addSample(page);
    await field(page, "title").fill("Нове питання");
    await expect(page.getByTestId("slide-preview").getByTestId("sample-title")).toHaveText("Нове питання");
    await expect(page.getByTestId("save-status")).not.toHaveAttribute("data-state", "saved");
    await saved(page);
  });

  test("правка зберігається, навіть якщо одразу піти зі сторінки", async ({ page, request, sql }) => {
    const created = await createViaApi(request, "закриття");
    await openEditor(page, created);
    await addSample(page);
    await saved(page);
    page.on("dialog", (dialog) => dialog.accept());
    await field(page, "title").fill("Збережено при виході");
    await page.waitForTimeout(1000);
    await page.goto("/");
    await expect
      .poll(async () => (await sql`select config->>'title' as title from slides where presentation_id = ${created.id}`)[0]?.title)
      .toBe("Збережено при виході");
    await openEditor(page, created);
    await expect(field(page, "title")).toHaveValue("Збережено при виході");
  });

  test("помилка мережі: статус помилки, повтор без втрати даних", async ({ page, request, sql }) => {
    const created = await createViaApi(request, "мережа");
    await openEditor(page, created);
    await addSample(page);
    await saved(page);
    await page.route("**/api/presentations/slides/*", (route) => (route.request().method() === "PUT" ? route.abort() : route.continue()));
    await field(page, "title").fill("Після відновлення");
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "error");
    await expect(page.getByTestId("save-status")).toContainText("Помилка збереження");
    await page.unroute("**/api/presentations/slides/*");
    await saved(page);
    await expect(field(page, "title")).toHaveValue("Після відновлення");
    const [row] = await sql`select config->>'title' as title from slides where presentation_id = ${created.id}`;
    expect(row.title).toBe("Після відновлення");
  });

  test("значення поза межами показує помилку й не зберігається", async ({ page, request, sql }) => {
    const created = await createViaApi(request, "межі");
    await openEditor(page, created);
    await addSample(page);
    await saved(page);
    await field(page, "size").fill("42");
    await expect(form(page).locator("#field-size-error")).toBeVisible();
    await page.waitForTimeout(1500);
    const [row] = await sql`select config->>'size' as size from slides where presentation_id = ${created.id}`;
    expect(row.size).toBe("3");
  });

  test("зображення слайда: PNG завантажується, SVG відхиляється", async ({ page, request, sql }) => {
    const created = await createViaApi(request, "зображення");
    await openEditor(page, created);
    await addSample(page);
    await form(page).getByTestId("field-image-empty").uncheck();
    await field(page, "image").setInputFiles({ name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
    await expect(form(page).getByTestId("field-image-upload-error")).toContainText("Непідтримуваний тип");
    await field(page, "image").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByTestId("slide-preview").getByTestId("sample-image")).toHaveAttribute("src", new RegExp(`/slide-media/${created.id}/`));
    await saved(page);
    const [row] = await sql`select config->>'image' as image from slides where presentation_id = ${created.id}`;
    expect(row.image).toContain(`/slide-media/${created.id}/`);
  });
});

test.describe("налаштування презентації", () => {
  test("назва, мова й логотип зберігаються", async ({ page, request, sql }) => {
    const created = await createViaApi(request, "налаштування");
    await openEditor(page, created);
    await page.getByRole("button", { name: "Налаштування", exact: true }).click();
    const dialog = page.getByTestId("settings-dialog");

    await dialog.getByTestId("settings-title").fill("   ");
    await expect(dialog.getByTestId("settings-title-error")).toHaveText("Назва не може бути порожньою.");
    const title = `${TEST_TITLE_PREFIX} Лекція 2`;
    await dialog.getByTestId("settings-title").fill(title);
    await expect(dialog.getByTestId("settings-title-error")).toHaveCount(0);
    await dialog.getByTestId("settings-locale").selectOption("en");

    await dialog.getByTestId("settings-logo").setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
    await expect(dialog.getByTestId("settings-logo-upload-error")).toContainText("Непідтримуваний тип");
    await dialog.getByTestId("settings-logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await expect(dialog.locator("img")).toHaveAttribute("src", new RegExp(`/slide-media/${created.id}/`));
    await saved(page);

    const [row] = await sql`select title, locale, theme from presentations where id = ${created.id}`;
    expect(row.title).toBe(title);
    expect(row.locale).toBe("en");
    expect(row.theme.logoUrl).toContain(`/slide-media/${created.id}/`);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await page.goto("/");
    await expect(page.getByText(title)).toBeVisible();
  });
});

test.describe("порожній реєстр типів", () => {
  test("меню додавання показує доступні типи (фікстура)", async ({ page, request }) => {
    const created = await createViaApi(request, "меню");
    await openEditor(page, created);
    await expect(page.getByTestId("no-slides")).toBeVisible();
    await page.getByRole("button", { name: "+ Додати слайд" }).click();
    await expect(page.getByTestId("add-editor-sample")).toBeVisible();
  });
});
