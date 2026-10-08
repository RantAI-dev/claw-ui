import { test, expect } from "@playwright/test";
import { startSandbox } from "./sandbox.mjs";

/**
 * The Chat recordings tab opens on a fresh gateway and says there is nothing yet.
 *
 * CI runs the newest *released* gateway, which may not know the `source`
 * parameter of `/sessions` and ignores it. A fresh sandbox holds no sessions of
 * any kind, so both an older and a newer gateway answer with an empty list, and
 * this asserts only that. Grouping, search and delete are covered by the unit
 * suite, where the response is written down.
 */
let sandbox: Awaited<ReturnType<typeof startSandbox>>;

test.beforeAll(async () => {
  sandbox = await startSandbox({ login: false });
});
test.afterAll(async () => {
  await sandbox?.stop();
});

test("Chat recordings shows its empty state on a gateway with no recordings", async ({ page }) => {
  await page.goto(`${sandbox.baseURL}/ops`);
  const nav = page.getByRole("button", { name: /^Memory/ });
  await expect(nav).toBeVisible({ timeout: 60_000 });
  await nav.click();

  await page.getByRole("button", { name: "Chat recordings", exact: true }).click();

  await expect(page.getByText("No chat recordings yet.")).toBeVisible();
  await expect(page.getByText(/kept thirty days after the last message/)).toBeVisible();
});
