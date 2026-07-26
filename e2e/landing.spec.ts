import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("serves the marketing page with a title and no console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    const response = await page.goto("/");

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/\S/);
    expect(consoleErrors).toEqual([]);
  });

  test("offers a route into the app for a signed-out visitor", async ({ page }) => {
    await page.goto("/");
    const signIn = page.getByRole("link", { name: /sign in|log in|get started/i }).first();
    await expect(signIn).toBeVisible();
  });

  test("keeps the page free of horizontal overflow on a phone", async ({ page }) => {
    await page.goto("/");
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});
