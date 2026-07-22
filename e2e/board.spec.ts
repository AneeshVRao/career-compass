import { test, expect } from "@playwright/test";

const TEST_COMPANY = "__e2e_test__";

test.describe("board: create and delete an event", () => {
  test.afterEach(async ({ page }) => {
    // Best-effort cleanup: if the test event still exists (e.g. the test failed
    // partway through), find and delete it so no leftover row lingers in the
    // real single-user database.
    await page.goto("/board");
    const card = page.getByText(TEST_COMPANY, { exact: true }).first();
    if (await card.isVisible().catch(() => false)) {
      page.once("dialog", (dialog) => dialog.accept());
      await card.click();
      await page.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText(TEST_COMPANY, { exact: true })).toHaveCount(0);
    }
  });

  test("creating an event shows it on the board, deleting removes it", async ({ page }) => {
    await page.goto("/board");

    await page.getByRole("button", { name: "New event" }).click();
    await page.getByPlaceholder("e.g. Google").fill(TEST_COMPANY);
    await page.getByRole("button", { name: "Create" }).click();

    const card = page.getByText(TEST_COMPANY, { exact: true }).first();
    await expect(card).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await card.click();
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText(TEST_COMPANY, { exact: true })).toHaveCount(0);
  });
});
