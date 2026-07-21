import { describe, expect, it } from "vitest";
import { validateCron } from "./cron";

describe("validateCron", () => {
  it("accepts valid expressions", () => {
    for (const e of ["0 9 * * *", "*/15 * * * *", "0 9 * * 1-5", "0 0 1 * *"])
      expect(validateCron(e)).toBeNull();
  });
  it("rejects wrong field count", () => {
    expect(validateCron("0 9 * *")).toMatch(/5 fields/);
  });
  it("rejects out-of-range fields", () => {
    expect(validateCron("99 9 * * *")).toMatch(/out of range/);
    expect(validateCron("0 25 * * *")).toMatch(/out of range/);
  });
});
