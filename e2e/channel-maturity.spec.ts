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
    // A locked channel gets its own dimmed section now, named by the runtime's
    // `support` axis, not by a badge sitting on a row it shares with usable
    // channels — that section heading is what carries the tier label.
    const ircRow = page.getByRole("listitem").filter({ hasText: "IRC" });
    await expect(ircRow).toContainText("under development · not started");
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
      //
      // Discord used to be this example and cannot be any more, for two
      // independent reasons. It has a setup card now, so it never appears in
      // this list; and the runtime catalog marks it `Driven`, so the assertion
      // below was already wrong about it before the card existed. WhatsApp
      // Cloud API is the one channel left in the supported-but-undriven state.
      // Matched loosely because the label itself moved: the released gateway
      // calls this channel "WhatsApp" and `main` calls it "WhatsApp Cloud API".
      // CI runs the released binary, so pinning either spelling would pass
      // locally and fail there, or the reverse.
      const undrivenRow = page.getByRole("listitem").filter({ hasText: /WhatsApp/ });
      await expect(undrivenRow).not.toContainText("under development");
      await expect(undrivenRow).toContainText("not yet verified");

      // The locked section names IRC and says whether its section is
      // configured; it does not carry a verification qualifier of its own —
      // that axis stays with the usable-but-undriven row asserted above.

      // Supported and driven: said out loud on Telegram's own card, so the good
      // case is not left to be inferred from an absence.
      //
      // Anchored to that card rather than to the page. Three channels are
      // driven in the runtime catalog and each says so on its own card or row,
      // so a page-wide locator matches three elements and fails strict mode —
      // which says nothing about whether the card under test is right.
      const telegramCard = page.locator('[data-channel-card="telegram"]');
      await expect(telegramCard.getByText("verified", { exact: true })).toBeVisible();
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
