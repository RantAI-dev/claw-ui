import { test, expect } from "@playwright/test";
import { startSandbox, LOGIN } from "./sandbox.mjs";

/**
 * Scenario (a): the login gate. This is the assertion the unit tests
 * structurally cannot make.
 *
 * The gate lives in `src/proxy.ts`, a Next middleware. A unit test can assert
 * that file's logic all day; what it cannot assert is that the framework
 * actually runs the middleware before serving `/api/rc/*`. A misconfigured
 * matcher, a renamed export, a Next upgrade that changes when middleware runs —
 * every one of those leaves the unit tests green and the console open.
 *
 * Console login is enabled by the *gateway*, not the UI, so the sandbox turns it
 * on in `config.toml` and the console follows.
 */
let sandbox: Awaited<ReturnType<typeof startSandbox>>;

test.beforeAll(async () => {
  sandbox = await startSandbox({ login: true });
});
test.afterAll(async () => {
  await sandbox?.stop();
});

test("an unauthenticated API request is refused, not served", async ({ request }) => {
  const res = await request.get(`${sandbox.baseURL}/api/rc/channels`);
  expect(res.status(), "the gateway-signed BFF must not answer an unauthenticated caller").not.toBe(
    200,
  );
  const body = await res.text();
  expect(
    body,
    "a refusal must not leak the payload it refused to serve",
  ).not.toContain("configured");
});

test("an unauthenticated navigation lands on the login page, not on the console", async ({
  page,
}) => {
  await page.goto(`${sandbox.baseURL}/ops`);
  await expect(page).toHaveURL(/\/login/);
});

test("logging in opens the console, and the same API call then answers", async ({ page }) => {
  await page.goto(`${sandbox.baseURL}/login`);
  // `getByPlaceholder`, not `getByLabel`: the two inputs on this form have no
  // label and no `aria-label` — only a placeholder, which disappears the moment
  // you type and is not a reliable accessible name. Writing this test is how
  // that was noticed. It is a real accessibility defect on the console's most
  // security-relevant form and it is deliberately NOT fixed here; a finding
  // found by a verification plan gets its own change.
  await page.getByPlaceholder("Username").fill(LOGIN.username);
  await page.getByPlaceholder("Password").fill(LOGIN.password);
  await page.getByRole("button", { name: /sign in|log in|unlock/i }).click();

  await expect(page).not.toHaveURL(/\/login/);

  const res = await page.request.get(`${sandbox.baseURL}/api/rc/channels`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("configured");
});

async function logIn(page: import("@playwright/test").Page) {
  await page.goto(`${sandbox.baseURL}/login`);
  await page.getByPlaceholder("Username").fill(LOGIN.username);
  await page.getByPlaceholder("Password").fill(LOGIN.password);
  await page.getByRole("button", { name: /sign in|log in|unlock/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function sessionCookie(context: import("@playwright/test").BrowserContext) {
  const cookie = (await context.cookies(sandbox.baseURL)).find((c) => c.name === "rc_session");
  if (!cookie) throw new Error("no rc_session cookie after login");
  return cookie.value;
}

test("a signed-out cookie is refused when replayed", async ({ page, context, request }) => {
  await logIn(page);
  const cookie = await sessionCookie(context);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  const replay = await request.get(`${sandbox.baseURL}/api/rc/status`, {
    headers: { cookie: `rc_session=${cookie}` },
  });
  expect(replay.status(), "a cookie presented after Sign out must not be accepted").toBe(401);
});

test("signing out also refuses an earlier re-signed copy of the session", async ({
  page,
  context,
  request,
}) => {
  await logIn(page);
  const cookieA = await sessionCookie(context);

  // The proxy re-signs a cookie once its activity stamp is a minute stale. Wait
  // past that, then make an activity-bearing call so the proxy issues cookie B.
  await page.waitForTimeout(61_000);
  const touch = await page.request.get(`${sandbox.baseURL}/api/rc/channels`);
  expect(touch.status()).toBe(200);
  const cookieB = await sessionCookie(context);
  expect(cookieB, "activity should have re-signed the cookie").not.toBe(cookieA);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  const replay = await request.get(`${sandbox.baseURL}/api/rc/status`, {
    headers: { cookie: `rc_session=${cookieA}` },
  });
  expect(replay.status(), "the earlier copy of the signed-out session must not be accepted").toBe(401);
});

test("signing out in one browser leaves a separate browser signed in", async ({
  page,
  browser,
}) => {
  await logIn(page);

  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await logIn(otherPage);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    const status = await otherPage.request.get(`${sandbox.baseURL}/api/rc/status`);
    expect(status.status(), "a second, separately logged-in browser must stay signed in").toBe(200);
  } finally {
    await other.close();
  }
});
