import { test, expect } from "@playwright/test";
import { createConfirmedUser, deleteTestUser, signIn, uniqueTestEmail } from "./helpers";

const TEST_COMPANY = "__e2e_test__";
const TEST_PASSWORD = "e2e-test-password-1!";

test.describe("board: create and delete an event", () => {
  let testEmail: string;

  // The board is now behind the auth guard, so each test needs its own
  // disposable signed-in user rather than an anonymous visit.
  test.beforeEach(async ({ page }) => {
    testEmail = uniqueTestEmail("board");
    await createConfirmedUser(testEmail, TEST_PASSWORD);
    await signIn(page, testEmail, TEST_PASSWORD);
  });

  test.afterEach(async ({ page }) => {
    // Best-effort cleanup: if the test event still exists (e.g. the test failed
    // partway through), find and delete it so no leftover row lingers behind.
    await page.goto("/board");
    await page.waitForLoadState("networkidle");
    const card = page.getByText(TEST_COMPANY, { exact: true }).first();
    if (await card.isVisible().catch(() => false)) {
      await card.click();
      const deleteButton = page.getByRole("button", { name: "Delete" });
      await expect(deleteButton).toBeVisible();
      await page.waitForTimeout(600); // let the Sheet's open animation settle
      page.once("dialog", (dialog) => dialog.accept());
      await deleteButton.click();
      await expect(page.getByText(TEST_COMPANY, { exact: true })).toHaveCount(0, {
        timeout: 15000,
      });
    }
    await deleteTestUser(testEmail);
  });

  test("creating an event shows it on the board, deleting removes it", async ({ page }) => {
    await page.goto("/board");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "New entry" }).click();
    await page.getByPlaceholder("e.g. Google").fill(TEST_COMPANY);
    await page.getByRole("button", { name: "Create" }).click();

    const card = page.getByText(TEST_COMPANY, { exact: true }).first();
    await expect(card).toBeVisible();
    await page.waitForTimeout(300); // let the post-create refetch/re-render settle

    await card.click();
    const deleteButton = page.getByRole("button", { name: "Delete" });
    await expect(deleteButton).toBeVisible();
    await page.waitForTimeout(600); // let the Sheet's open animation settle
    page.once("dialog", (dialog) => dialog.accept());
    await deleteButton.click();

    await expect(page.getByText(TEST_COMPANY, { exact: true })).toHaveCount(0, { timeout: 15000 });
  });
});
