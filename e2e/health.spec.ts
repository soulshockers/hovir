import { expect, test } from "@playwright/test";

test("сторінка стану відкривається і показує загальний стан", async ({ page }) => {
  await page.goto("/health");
  await expect(page.getByRole("heading", { level: 1, name: "Стан інстансу" })).toBeVisible();

  const overall = page.getByTestId("health-overall");
  await expect(overall).toBeVisible();
  await expect(overall).not.toBeEmpty();
  await expect(overall).toHaveAttribute("data-status", /^(ok|error)$/);
});
