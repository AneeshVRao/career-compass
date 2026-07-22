import { test, expect } from "@playwright/test";

test("dashboard loads and renders its heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
});
