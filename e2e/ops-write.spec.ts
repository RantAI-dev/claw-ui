import { test, expect } from "@playwright/test";
import { startSandbox } from "./sandbox.mjs";

/**
 * Scenario (c): a write from an ops panel actually lands on the server.
 *
 * The console audits kept finding the same shape — a save that reports success
 * and changes nothing, or changes something other than what the panel showed.
 * A unit test cannot catch that: it asserts the request body the console sent,
 * which is exactly the half that was already right.
 *
 * So this asserts the *gateway's* state afterwards, read back through a
 * different endpoint than the one the write used.
 */
let sandbox: Awaited<ReturnType<typeof startSandbox>>;

test.beforeAll(async () => {
  sandbox = await startSandbox({ login: false });
});
test.afterAll(async () => {
  await sandbox?.stop();
});

test("switching the autonomy preset changes what the gateway reports", async ({ page }) => {
  await page.goto(`${sandbox.baseURL}/ops`);
  const strict = page.getByRole("button", { name: "Strict", exact: true });
  await expect(strict).toBeVisible({ timeout: 60_000 });

  const before = await (await page.request.get(`${sandbox.baseURL}/api/rc/status`)).json();

  // The sidebar preset switch — the console's most reachable write.
  await strict.click();

  await expect
    .poll(
      async () => {
        const res = await page.request.get(`${sandbox.baseURL}/api/rc/status`);
        const body = await res.json();
        return body.autonomy_preset ?? body.autonomy;
      },
      {
        message:
          "the gateway must report the new preset — a panel that reports success without moving server state is the defect this scenario exists for",
      },
    )
    .not.toBe(before.autonomy_preset ?? before.autonomy);
});
