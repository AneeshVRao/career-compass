import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

// Same spirit as board.spec.ts's tag: anything these specs create is identifiable
// and deleted afterwards, because there is no separate test project.
export const TEST_TAG = "__e2e_test__";

// Playwright does not go through Vite, so .env is not loaded for the test process.
// Read it directly rather than adding a dotenv dependency for one helper.
export function env(name: string): string | undefined {
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

function adminHeaders(): { url: string; headers: Record<string, string> } | null {
  const url = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return {
    url,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
  };
}

export function uniqueTestEmail(label = ""): string {
  return `${TEST_TAG}+${label}${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`;
}

// Creates an already-confirmed account via the admin API. Going through the admin
// API rather than the signup form is deliberate: it makes the spec independent of
// whether "Confirm email" happens to be enabled on the project, so a test that
// needs a *real session* gets one deterministically. The handle_new_user() trigger
// fires on auth.users insert either way, so the settings row is still provisioned.
export async function createConfirmedUser(email: string, password: string): Promise<void> {
  const admin = adminHeaders();
  if (!admin) throw new Error("[e2e] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required");
  const res = await fetch(`${admin.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: admin.headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`[e2e] could not create ${email} (${res.status}): ${await res.text()}`);
  }
}

// Deletes the disposable auth user (settings/events rows cascade from auth.users).
// Best-effort: a cleanup failure must not mask a test result, but it is reported so
// silent leaks don't accumulate unnoticed.
export async function deleteTestUser(email: string): Promise<void> {
  const admin = adminHeaders();
  if (!admin) {
    console.warn(`[e2e cleanup] missing Supabase admin credentials; leftover user: ${email}`);
    return;
  }
  const listRes = await fetch(`${admin.url}/auth/v1/admin/users?per_page=200`, {
    headers: admin.headers,
  });
  if (!listRes.ok) {
    console.warn(`[e2e cleanup] could not list users (${listRes.status}); leftover: ${email}`);
    return;
  }
  const body = (await listRes.json()) as { users?: { id: string; email?: string }[] };
  const match = body.users?.find((u) => u.email === email);
  if (!match) return;
  const delRes = await fetch(`${admin.url}/auth/v1/admin/users/${match.id}`, {
    method: "DELETE",
    headers: admin.headers,
  });
  if (!delRes.ok) {
    console.warn(`[e2e cleanup] could not delete ${email} (${delRes.status})`);
  }
}

// Signs in through the real login form, so the session is established the same way
// a user's would be (cookie written by the app, not injected by the test).
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/localhost:8080\/$/, { timeout: 20000 });
}

// Creates one event via the board's drawer and waits for it to render.
export async function createEvent(page: Page, company: string): Promise<void> {
  await page.goto("/board");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "New entry" }).click();
  await page.getByPlaceholder("e.g. Google").fill(company);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(company, { exact: true }).first()).toBeVisible({ timeout: 15000 });
}
