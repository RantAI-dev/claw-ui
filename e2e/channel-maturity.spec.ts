import { test, expect } from "@playwright/test";
import { startSandbox } from "./sandbox.mjs";

/**
 * Scenario (e): the channel maturity badge.
 *
 * The runtime publishes a tier per channel on `/api/v1/channels` and the
 * console renders it. This is the end-to-end half of that pair — the unit tests
 * assert the component given a catalog, and this asserts the catalog actually
 * arrives from a real gateway and reaches the pixel.
 *
 * The sandbox configures IRC, which the runtime marks `under_development`.
 */
let sandbox: Awaited<ReturnType<typeof startSandbox>>;

test.beforeAll(async () => {
  sandbox = await startSandbox({ login: false });
});
test.afterAll(async () => {
  await sandbox?.stop();
});

test("an under-development channel is badged, and a supported one is not", async ({ page }) => {
  await page.goto(`${sandbox.baseURL}/ops`);
  const nav = page.getByRole("button", { name: /^Channels/ });
  await expect(nav).toBeVisible({ timeout: 60_000 });
  await nav.click();

  const ircRow = page.getByRole("listitem").filter({ hasText: "IRC" });
  await expect(ircRow).toContainText("Under development");

  // Telegram is `supported` and has its own card; it must carry no tier badge.
  await expect(page.getByText("Under development", { exact: true })).toHaveCount(1);
});
