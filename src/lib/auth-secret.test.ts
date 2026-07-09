import { describe, it, expect, afterEach } from "vitest";
import { sessionSecretConfigured } from "./auth";

const ORIG = process.env.RANTAICLAW_UI_SECRET;
afterEach(() => {
  if (ORIG === undefined) delete process.env.RANTAICLAW_UI_SECRET;
  else process.env.RANTAICLAW_UI_SECRET = ORIG;
});

describe("sessionSecretConfigured (fail-closed guard)", () => {
  it("is false when the secret is unset (→ callers must 503, not bypass)", () => {
    delete process.env.RANTAICLAW_UI_SECRET;
    expect(sessionSecretConfigured()).toBe(false);
  });

  it("is false when the secret is empty", () => {
    process.env.RANTAICLAW_UI_SECRET = "";
    expect(sessionSecretConfigured()).toBe(false);
  });

  it("is true when a real secret is set", () => {
    process.env.RANTAICLAW_UI_SECRET = "a-long-random-secret";
    expect(sessionSecretConfigured()).toBe(true);
  });
});
