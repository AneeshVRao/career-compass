import { test, expect } from "@playwright/test";
import { TEST_TAG, createConfirmedUser, deleteTestUser, signIn, uniqueTestEmail } from "./helpers";

const PROTECTED_PATHS = ["/", "/board", "/calendar", "/list", "/settings"];

test.describe("auth: route protection", () => {
  for (const path of PROTECTED_PATHS) {
    test(`unauthenticated visit to ${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    });
  }

  test("the login page offers both password and Google sign-in", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  });
});

test.describe("auth: signup and sign-out", () => {
  let email = "";

  test.afterEach(async () => {
    if (email) await deleteTestUser(email);
  });

  test("signing up either signs the user in or asks for email confirmation", async ({ page }) => {
    email = `${TEST_TAG}+${Date.now()}@example.com`;

    await page.goto("/login");
    await page.getByRole("button", { name: "Create one" }).click();
    await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(`Pw-${Date.now()}-aA1`);
    await page.getByRole("button", { name: "Create account" }).click();

    // Both outcomes are legitimate and depend on whether email confirmation is
    // enabled on the Supabase project, so accept either rather than pinning the
    // test to one dashboard setting.
    const confirmationNotice = page.getByText("Check your email for a confirmation link", {
      exact: false,
    });
    await expect
      .poll(
        async () =>
          (await confirmationNotice.isVisible().catch(() => false)) ||
          new URL(page.url()).pathname === "/",
        { timeout: 20000 },
      )
      .toBe(true);

    if (new URL(page.url()).pathname !== "/") return;

    // Confirmation is off, so we have a real session: the shell shows the signed-in
    // address, and signing out must bounce back to /login.
    await expect(page.getByText(email, { exact: true }).first()).toBeVisible();

    // The handle_new_user() trigger should have provisioned a settings row seeded
    // with the signup address, so /settings renders it pre-populated rather than
    // blank. See the deterministic version of this below, which does not depend on
    // the project's "Confirm email" setting.
    await expect(page.getByLabel("Recipient email")).toHaveValue(email, { timeout: 15000 });

    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/login$/);

    // A signed-out session must not be able to walk back into a protected page.
    await page.goto("/board");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("auth: new-user provisioning", () => {
  let email = "";

  test.afterEach(async () => {
    if (email) await deleteTestUser(email);
  });

  // Proves the handle_new_user() database trigger fired: nothing in the app code
  // creates a settings row, so a pre-populated reminder_email on a brand-new
  // account can only have come from the trigger. Uses an admin-created confirmed
  // account so the assertion runs regardless of the "Confirm email" setting.
  test("a brand-new account gets a settings row seeded with its own email", async ({ page }) => {
    email = uniqueTestEmail("provision-");
    const password = `Pw-${Date.now()}-aA1!`;
    await createConfirmedUser(email, password);

    await signIn(page, email, password);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByLabel("Recipient email")).toHaveValue(email, { timeout: 15000 });
    // The trigger seeds a default sender too; an empty value would mean no row.
    await expect(page.getByLabel("From address")).not.toHaveValue("");
  });
});
