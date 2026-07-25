import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

// Same spirit as board.spec.ts's __e2e_test__ tag: anything this spec creates is
// identifiable and deleted afterwards, because there is no separate test project.
const TEST_TAG = "__e2e_test__";
const PROTECTED_PATHS = ["/", "/board", "/calendar", "/list", "/settings"];

// Playwright does not go through Vite, so .env is not loaded for the test process.
// Read it directly rather than adding a dotenv dependency for one helper.
function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(new URL("../.env", import.meta.url), "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).replace(/^"|"$/g, "");
  } catch {
    return undefined;
  }
}

// Deletes the disposable auth user (settings/events rows cascade from
// auth.users). Best-effort: a cleanup failure must not mask a test result, but it
// is reported so silent leaks don't accumulate unnoticed.
async function deleteTestUser(email: string): Promise<void> {
  const url = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.warn(`[e2e cleanup] missing Supabase admin credentials; leftover user: ${email}`);
    return;
  }
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const listRes = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
  if (!listRes.ok) {
    console.warn(`[e2e cleanup] could not list users (${listRes.status}); leftover: ${email}`);
    return;
  }
  const body = (await listRes.json()) as { users?: { id: string; email?: string }[] };
  const match = body.users?.find((u) => u.email === email);
  if (!match) return;
  const delRes = await fetch(`${url}/auth/v1/admin/users/${match.id}`, {
    method: "DELETE",
    headers,
  });
  if (!delRes.ok) {
    console.warn(`[e2e cleanup] could not delete ${email} (${delRes.status})`);
  }
}

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
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/login$/);

    // A signed-out session must not be able to walk back into a protected page.
    await page.goto("/board");
    await expect(page).toHaveURL(/\/login$/);
  });
});
