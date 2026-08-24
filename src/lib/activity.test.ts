import { describe, it, expect } from "vitest";
import { isBackgroundPath } from "./activity";

describe("isBackgroundPath", () => {
  it("treats the polling GETs as background (they must not slide the idle window)", () => {
    expect(isBackgroundPath("/api/rc/status")).toBe(true);
    expect(isBackgroundPath("/api/rc/config")).toBe(true);
    expect(isBackgroundPath("/api/rc/cron")).toBe(true);
  });

  it("treats real user actions as activity, not background", () => {
    // Session list load, a config mutation, and a cron mutation are all user
    // actions and must count as activity.
    expect(isBackgroundPath("/api/rc/sessions")).toBe(false);
    expect(isBackgroundPath("/api/rc/config/autonomy")).toBe(false);
    expect(isBackgroundPath("/api/rc/cron/abc-123")).toBe(false);
    expect(isBackgroundPath("/api/chat")).toBe(false);
  });
});
