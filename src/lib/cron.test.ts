import { describe, expect, it } from "vitest";
import {
  PAST_ONE_OFF,
  createWarningReason,
  fmtWhen,
  formatEvery,
  formatSchedule,
  isPastOneOffRefusal,
  jobState,
  refusalReason,
  statusTone,
  statusWord,
  validateCron,
} from "./cron";

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

const NOW = Date.parse("2026-09-01T05:20:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();
const cron = { kind: "cron" as const, expr: "0 9 * * *", tz: null };

describe("jobState", () => {
  it("calls an enabled job overdue only past the grace", () => {
    expect(jobState({ enabled: true, next_run: ago(10 * 60_000), last_run: null, schedule: cron }, NOW)).toBe("overdue");
    expect(jobState({ enabled: true, next_run: ago(30_000), last_run: null, schedule: cron }, NOW)).toBe("scheduled");
    expect(jobState({ enabled: true, next_run: ahead(3_600_000), last_run: null, schedule: cron }, NOW)).toBe("scheduled");
  });
  it("calls a disabled job paused, and a past one-off ran-once or missed", () => {
    expect(jobState({ enabled: false, next_run: ahead(1), last_run: null, schedule: cron }, NOW)).toBe("paused");
    const past = { kind: "at" as const, at: ago(60_000) };
    expect(jobState({ enabled: false, next_run: past.at, last_run: past.at, schedule: past }, NOW)).toBe("ran-once");
    expect(jobState({ enabled: false, next_run: past.at, last_run: null, schedule: past }, NOW)).toBe("missed");
    const future = { kind: "at" as const, at: ahead(60_000) };
    expect(jobState({ enabled: false, next_run: future.at, last_run: null, schedule: future }, NOW)).toBe("paused");
  });
});

describe("status words", () => {
  it("uses one vocabulary for last_status and run rows", () => {
    expect(statusWord("error")).toBe("failed");
    expect(statusWord("refused")).toBe("refused");
    expect(statusWord("ok")).toBe("ok");
    expect(statusWord(null)).toBe("");
    expect(statusTone("ok")).toBe("secondary");
    expect(statusTone("error")).toBe("destructive");
    expect(statusTone("refused")).toBe("warning");
  });
});

describe("gateway sentences", () => {
  it("extracts a policy refusal's reason", () => {
    expect(refusalReason("blocked by security policy: forbidden path argument: /etc/hostname")).toBe(
      "forbidden path argument: /etc/hostname",
    );
    expect(refusalReason("job failed: boom")).toBeNull();
  });
  it("keeps the reason of the create warning and drops the force-run advice", () => {
    const wire =
      "created, but will not run on its schedule (Command requires explicit approval (approved=true): medium-risk operation); force-run it with an approval, or use an allowlisted low-risk command";
    expect(createWarningReason(wire)).toBe(
      "Command requires explicit approval (approved=true): medium-risk operation",
    );
    expect(createWarningReason("something else")).toBe("something else");
  });
  it("recognises the past one-off refusal", () => {
    expect(
      isPastOneOffRefusal(
        "cannot re-enable one-shot cron job 'x': its scheduled time (2026-09-01 05:09:25 UTC) is in the past.",
      ),
    ).toBe(true);
    expect(isPastOneOffRefusal("Cron job 'x' not found")).toBe(false);
    expect(PAST_ONE_OFF).toMatch(/new time/);
  });
});

describe("schedule words", () => {
  it("formats intervals in minutes, seconds or milliseconds", () => {
    expect(formatEvery(60_000)).toBe("every minute");
    expect(formatEvery(120_000)).toBe("every 2 min");
    expect(formatEvery(300_000, true)).toBe("every 5 minutes");
    expect(formatEvery(30_000)).toBe("every 30 s");
    expect(formatEvery(1_500)).toBe("every 1500 ms");
  });
  it("renders every schedule kind", () => {
    expect(formatSchedule({ kind: "cron", expr: "0 9 * * *", tz: "Asia/Jakarta" })).toBe(
      "0 9 * * * (Asia/Jakarta)",
    );
    expect(formatSchedule({ kind: "cron", expr: "0 9 * * *" })).toBe("0 9 * * *");
    expect(formatSchedule({ kind: "every", every_ms: 30_000 })).toBe("every 30 s");
    expect(formatSchedule({ kind: "at", at: "2026-09-01T05:09:25Z" })).toMatch(/^once at /);
  });
  it("names a missing time", () => {
    expect(fmtWhen(null)).toBe("not yet");
    expect(fmtWhen(undefined)).toBe("not yet");
    expect(fmtWhen("garbage")).toBe("garbage");
  });
});
