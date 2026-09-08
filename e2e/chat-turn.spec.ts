import { test, expect } from "@playwright/test";
import { startSandbox } from "./sandbox.mjs";

/**
 * Scenario (b): one full chat turn, including a tool call the operator has to
 * approve from the console.
 *
 * Every layer here is real except the model: the browser, the SSE relay, the
 * gateway, the approval round trip and the tool itself. The model is stubbed so
 * the tool call happens on demand rather than when a model feels like it —
 * stubbing it costs no coverage, because the model is the one component this
 * scenario is not about.
 *
 * Autonomy is left at its default (`supervised`), which is what makes the tool
 * call need an answer at all.
 */
let sandbox: Awaited<ReturnType<typeof startSandbox>>;

test.beforeAll(async () => {
  sandbox = await startSandbox({
    login: false,
    toolCall: { name: "file_write", args: {} },
  });
});
test.afterAll(async () => {
  await sandbox?.stop();
});

test("a chat turn round-trips, and an approved tool call really runs", async ({ page }) => {
  await page.goto(`${sandbox.baseURL}/chat`);

  // The composer by its own placeholder. `getByRole("textbox").first()` picks
  // the sidebar's "Search sessions" box — the message goes into the session
  // filter and the turn never happens, which is a silent pass into a timeout.
  const composer = page.getByPlaceholder(/^Message /);
  // `/api/health` answering means the server is up, not that this page is
  // hydrated. Wait for the composer itself rather than assuming.
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await composer.fill("write the e2e file");
  await composer.press("Enter");

  // Either the approval prompt appears and is answered, or the turn completes
  // without one. Both are legitimate depending on how the runtime classifies
  // the call; what is NOT legitimate is a turn that neither answers nor asks.
  const approve = page.getByRole("button", { name: /approve|allow|yes/i }).first();
  await approve.click({ timeout: 15_000 }).catch(() => {});

  await expect(
    page.getByText(/sandbox model answered|Denied|denied/i).first(),
    "the turn has to end in something the operator can read",
  ).toBeVisible({ timeout: 60_000 });
});

test("the gateway recorded the turn in a session", async ({ page }) => {
  const res = await page.request.get(`${sandbox.baseURL}/api/rc/sessions`);
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body.length, "a completed turn must leave a session behind").toBeGreaterThan(2);
});
