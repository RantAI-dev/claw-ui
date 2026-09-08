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
