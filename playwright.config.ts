import { defineConfig } from "@playwright/test";

/**
 * The console's first end-to-end layer.
 *
 * 695 unit tests click real buttons and assert real request bodies, which is
 * why the console scores as well as it does — but they all stop at the BFF
 * boundary. Nothing had ever verified that a login actually gates, that a chat
 * turn survives a round trip, or that the console stays legible when the
 * gateway is down.
 *
 * Each spec starts its own sandbox (see `e2e/sandbox.mjs`) because the
 * scenarios need different gateway configurations — login on, login off, and a
 * gateway that dies mid-test. `workers: 1` keeps that to one gateway process at
 * a time and keeps failures reproducible; five scenarios do not need
 * parallelism, and a flaky E2E gets disabled, which is worse than a slow one.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  // No retries. A scenario that only passes on the second attempt is telling
  // you something, and `retries` is how that stops being heard.
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
