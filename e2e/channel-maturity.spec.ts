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

test("the console renders the runtime's labels, or degrades to keys when it has none", async ({
  page,
}) => {
  // Which of the two branches below runs depends on the gateway, not on the
  // console: `channels[]` arrived with RantaiClaw #766, and CI runs the newest
  // *released* binary, which can still predate it. Both branches are real
  // behaviour the console promises, so both are asserted rather than one being
  // skipped — a skipped scenario is decoration, and this pair also pins the
  // version-skew degradation that the deleted hard-coded catalog used to cover.
  const catalog = await (await page.request.get(`${sandbox.baseURL}/api/rc/channels`)).json();
  const servesCatalog = Array.isArray(catalog.channels) && catalog.channels.length > 0;

  await page.goto(`${sandbox.baseURL}/ops`);
  const nav = page.getByRole("button", { name: /^Channels/ });
  await expect(nav).toBeVisible({ timeout: 60_000 });
  await nav.click();

  if (servesCatalog) {
    const ircRow = page.getByRole("listitem").filter({ hasText: "IRC" });
    await expect(ircRow).toContainText("Under development");
    // Telegram is `supported` and has its own card; it carries no support badge.
    await expect(page.getByText("Under development", { exact: true })).toHaveCount(1);

    // The verification axis, when the gateway has one. A runtime between #766
    // and the split serves `maturity` alone, so this half is conditional on the
    // field being present rather than on the catalog being present at all.
    const servesVerification = catalog.channels.some(
      (c: { verification?: string }) => typeof c.verification === "string",
    );
    if (servesVerification) {
      // Supported and never driven: no support badge, and the qualifier shown.
      // This is the state that was invisible before the split.
      const discordRow = page.getByRole("listitem").filter({ hasText: "Discord" });
      await expect(discordRow).not.toContainText("Under development");
      await expect(discordRow).toContainText("not yet verified");

      // Under development and never driven: both signals on one row.
      await expect(ircRow).toContainText("not yet verified");

      // Supported and driven: said out loud on Telegram's own card, so the good
      // case is not left to be inferred from an absence.
      await expect(page.getByText("verified", { exact: true })).toBeVisible();
    }
    return;
  }

  // A gateway too old to send a catalog: the row must still render, by key,
  // and claim no tier it was not told. Blanking the panel is the failure this
  // covers — it is what a second hard-coded catalog was there to prevent.
  const row = page.getByRole("listitem").filter({ hasText: "irc" });
  await expect(row).toBeVisible();
  await expect(page.getByText("Under development", { exact: true })).toHaveCount(0);
});
