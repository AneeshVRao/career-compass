// The single most important property of the multi-user feature: one user's data is
// invisible to another. Everything else about auth can be right and this still be
// wrong (a missing RLS policy, a query that forgets to scope by user), so it is
// asserted against two real accounts and two real browser sessions rather than
// inferred from the policy SQL.
//
// Follows the tag-and-clean convention from board.spec.ts / auth.spec.ts: both
// accounts are disposable, tagged, and deleted in afterEach even when the test
// fails partway through — deleting the auth user cascades its settings/events rows.
import { test, expect, type Browser, type Page } from "@playwright/test";
import {
  TEST_TAG,
  createConfirmedUser,
  createEvent,
  deleteTestUser,
  signIn,
  uniqueTestEmail,
} from "./helpers";

type Account = { email: string; password: string; company: string };

// Serial, because both accounts write to the same real project and the assertions
// are about what is and isn't visible across them.
test.describe.configure({ mode: "serial" });

test.describe("multi-user: cross-user data isolation", () => {
  let accounts: Account[] = [];

  test.beforeEach(() => {
    const stamp = Date.now();
    accounts = ["a", "b"].map((label) => ({
      email: uniqueTestEmail(`${label}-`),
      password: `Pw-${stamp}-${label}A1!`,
      company: `${TEST_TAG}-${label}-${stamp}`,
    }));
  });

  test.afterEach(async () => {
    for (const account of accounts) await deleteTestUser(account.email);
  });

  test("neither account can see the other's event on /board or /list", async ({ browser }) => {
    const [userA, userB] = accounts;

    // Separate contexts so the two sessions have genuinely separate cookie jars —
    // reusing one context would only prove the app re-renders after a sign-out.
    const sessionA = await openSession(browser, userA);
    const sessionB = await openSession(browser, userB);

    try {
      await createEvent(sessionA.page, userA.company);
      await createEvent(sessionB.page, userB.company);

      // B was created after A, so check A last as well as first: a leak would most
      // plausibly show up on a refetch, not on the initial render.
      await expectOwnEventOnly(sessionB.page, userB.company, userA.company);
      await expectOwnEventOnly(sessionA.page, userA.company, userB.company);
    } finally {
      await sessionA.close();
      await sessionB.close();
    }
  });

  test("a signed-out session cannot reach another user's data", async ({ browser, page }) => {
    const [userA] = accounts;
    const sessionA = await openSession(browser, userA);
    try {
      await createEvent(sessionA.page, userA.company);
    } finally {
      await sessionA.close();
    }

    // A fresh, anonymous context must be bounced to /login and must not have
    // rendered A's company anywhere on the way through.
    await page.goto("/list");
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.content()).not.toContain(userA.company);
  });
});

async function openSession(browser: Browser, account: Account) {
  await createConfirmedUser(account.email, account.password);
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, account.email, account.password);
  return { page, close: () => context.close() };
}

// Asserts the page shows this user's own event and that the other user's company
// string appears nowhere in the served markup — not merely that it isn't visible,
// since an SSR payload leak would still be a data leak.
async function expectOwnEventOnly(page: Page, ownCompany: string, otherCompany: string) {
  for (const path of ["/board", "/list"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(ownCompany, { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });
    expect(
      await page.content(),
      `${otherCompany} leaked into ${path} for the other account`,
    ).not.toContain(otherCompany);
  }
}
