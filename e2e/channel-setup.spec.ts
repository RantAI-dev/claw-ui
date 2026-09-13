import { test, expect } from "@playwright/test";
import { startSandbox } from "./sandbox.mjs";

/**
 * Scenario (f): a credential the gateway refuses never reaches the config.
 *
 * The unit suites assert the request body the card sends, which is the half
 * that was already right. This asserts the other half against a real gateway:
 * that a refusal is shown to the operator, and that nothing was written.
 *
 * Slack is the subject rather than Discord because the sandbox configures
 * Discord with a placeholder token, so its card opens in manage mode; Slack is
 * absent from that config and opens the connect form this scenario needs.
 *
 * No network dependency, on purpose. A fake token is refused when Slack answers
 * and refused when nothing can be reached — plan 366 decided an inconclusive
 * probe fails closed rather than being saved — so both outcomes produce the
 * same two observable facts, and neither branch is skipped.
 */
let sandbox: Awaited<ReturnType<typeof startSandbox>>;

test.beforeAll(async () => {
  sandbox = await startSandbox({ login: false });
});
test.afterAll(async () => {
  await sandbox?.stop();
});

test("a bot token the gateway refuses is not saved, and the card says why", async ({ page }) => {
  await page.goto(`${sandbox.baseURL}/ops`);
  const nav = page.getByRole("button", { name: /^Channels/ });
  await expect(nav).toBeVisible({ timeout: 60_000 });
  await nav.click();

  const before = await (await page.request.get(`${sandbox.baseURL}/api/rc/channels`)).json();
  expect(before.configured).not.toContain("slack");

  const token = page.getByLabel("Slack bot token");
  await expect(token).toBeVisible();
  await token.fill("xoxb-0000000000-not-a-real-token");
  await page.getByRole("button", { name: "Connect Slack" }).click();

  // The gateway's own words, either verdict. The console must not translate a
  // refusal into a success, and must not invent a reason of its own.
  await expect(
    page.getByText(/rejected the bot token|could not check the bot token/i),
  ).toBeVisible();

  // Read back through a different endpoint than the write used: a panel that
  // reports failure while the credential lands anyway is the defect that
  // matters most here, and it is invisible from the browser alone.
  const after = await (await page.request.get(`${sandbox.baseURL}/api/rc/channels`)).json();
  expect(after.configured).not.toContain("slack");

  // Still on the connect form, with somewhere to put a corrected token.
  await expect(page.getByLabel("Slack bot token")).toBeVisible();
});

test("the console offers a setup card for each channel it can configure", async ({ page }) => {
  // The catalog arrives from a real gateway here, so this also pins that
  // `/api/v1/channels` still carries the keys the cards are keyed on.
  await page.goto(`${sandbox.baseURL}/ops`);
  const nav = page.getByRole("button", { name: /^Channels/ });
  await expect(nav).toBeVisible({ timeout: 60_000 });
  await nav.click();

  await expect(page.getByRole("heading", { name: "Telegram" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Discord" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Slack" })).toBeVisible();

  // Discord is configured in the sandbox with a token, so its card manages the
  // allowlist rather than offering to connect.
  await expect(page.getByRole("button", { name: "Disconnect Discord" })).toBeVisible();
});
