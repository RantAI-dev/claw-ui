import { test, expect } from "@playwright/test";
import { startSandbox } from "./sandbox.mjs";

/**
 * Scenario (d): the gateway goes away.
 *
 * The failure this guards against is not a crash — it is a console that looks
 * fine. A blank panel and a spinner that never resolves both read as "nothing
 * configured yet" to an operator, which is the opposite of the truth.
 */
let sandbox: Awaited<ReturnType<typeof startSandbox>>;

test.beforeAll(async () => {
  sandbox = await startSandbox({ login: false });
});
test.afterAll(async () => {
  await sandbox?.stop();
});

test("with the gateway dead the console says so instead of spinning", async ({ page }) => {
  await page.goto(`${sandbox.baseURL}/ops`);
  await expect(page.getByRole("button", { name: /^Channels/ })).toBeVisible({
    timeout: 60_000,
  });

  // Kill the gateway out from under the running console, and wait until it has
  // really stopped answering before asserting anything about the outage.
  await sandbox.killGateway();

  const res = await page.request.get(`${sandbox.baseURL}/api/rc/channels`);
  expect(
    res.status(),
    "the BFF must report the outage rather than serving a stale or empty success",
  ).toBe(502);

  await page.reload();
  // Something on the page has to name the outage. Which words are the console's
  // business; that there are some is this test's.
  await expect(
    page.getByText(/offline|unreachable|could not reach|not running|disconnected/i).first(),
  ).toBeVisible();
});
