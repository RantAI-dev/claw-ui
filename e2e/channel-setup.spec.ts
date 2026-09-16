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

  // Does this gateway have the setup route at all?
  //
  // CI runs the newest *released* binary, and these endpoints landed in
  // RantAIClaw #813, which no release carries yet. An empty body writes nothing
  // either way: a gateway without the route answers 404, and one with it
  // answers 400 because no token was sent and none is saved. The proxy relays
  // the gateway's status untouched (`src/app/api/rc/[...path]/route.ts:33-36`),
  // so the status is the gateway's own answer.
  const probe = await page.request.post(`${sandbox.baseURL}/api/rc/channels/slack`, { data: {} });
  const servesChannelSetup = probe.status() !== 404;

  const token = page.getByLabel("Slack bot token");
  await expect(token).toBeVisible();
  await token.fill("xoxb-0000000000-not-a-real-token");
  await page.getByRole("button", { name: "Connect Slack" }).click();

  if (servesChannelSetup) {
    // The gateway's own words, either verdict. The console must not translate a
    // refusal into a success, and must not invent a reason of its own.
    await expect(
      page.getByText(/rejected the bot token|could not check the bot token/i),
    ).toBeVisible();
  }
  // Against a gateway too old to have the route, the wording is the proxy's 404
  // rather than a credential verdict, so it is not asserted — but the two facts
  // below are the ones that matter, and they hold in both worlds. This branch
  // disappears on the next RantaiClaw release; until then the refusal wording
  // is covered only by the local run against a gateway built from `main`.

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

test("the Lark card appears only when the gateway actually recognises it", async ({ page }) => {
  // Plan 381's STOP condition: CI runs the newest *released* RantaiClaw
  // binary, and Lark joining the default build (RantaiClaw #822) plus the
  // gateway routes this card calls (RantaiClaw #825) landed after the last
  // cut release. Checked directly against that release: it already lists
  // "lark" in /api/v1/channels (the catalog names every channel type the
  // project knows, key gating or not) but omits `has_credentials` for it,
  // because that build never recognised a configured Lark section. Gating on
  // key presence would have offered a Connect button pointed at a route that
  // 404s on exactly this binary — `has_credentials` being sent at all,
  // matching what the component checks, is the real signal.
  const catalog = await (await page.request.get(`${sandbox.baseURL}/api/rc/channels`)).json();
  const lark = (catalog.channels ?? []).find((c: { key?: string }) => c.key === "lark");
  const gatewayRecognisesLark = lark !== undefined && "has_credentials" in lark;

  await page.goto(`${sandbox.baseURL}/ops`);
  const nav = page.getByRole("button", { name: /^Channels/ });
  await expect(nav).toBeVisible({ timeout: 60_000 });
  await nav.click();

  if (gatewayRecognisesLark) {
    await expect(page.getByRole("heading", { name: "Lark" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect Lark" })).toBeVisible();
    return;
  }

  // The gateway this run actually has: no Lark heading, no dead Connect
  // button pointed at a route that would 404.
  await expect(page.getByRole("heading", { name: "Lark" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Lark" })).not.toBeVisible();
});
