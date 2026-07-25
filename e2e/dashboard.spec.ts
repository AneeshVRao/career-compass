import { test, expect } from "@playwright/test";
import { createConfirmedUser, deleteTestUser, signIn, uniqueTestEmail } from "./helpers";

const TEST_PASSWORD = "e2e-test-password-1!";

test.describe("dashboard", () => {
  let testEmail: string;

  // The dashboard is now behind the auth guard, so it needs a signed-in user.
  test.beforeEach(async ({ page }) => {
    testEmail = uniqueTestEmail("dashboard");
    await createConfirmedUser(testEmail, TEST_PASSWORD);
    await signIn(page, testEmail, TEST_PASSWORD);
  });

  test.afterEach(async () => {
    await deleteTestUser(testEmail);
  });

  test("dashboard loads and renders its heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Season Overview", level: 1 })).toBeVisible();
  });
});
