import { describe, expect, it } from "vitest";
import {
  PAST_ONE_OFF,
  cronVerdict,
  buildSchedule,
  createWarningReason,
  describeCron,
  firstLine,
  fmtWhen,
  formatEvery,
  formatSchedule,
  isPastOneOffRefusal,
  jobState,
  previewSchedule,
  refusalReason,
  sameSchedule,
  scheduleDraftError,
  statusTone,
  statusWord,
  toLocalInput,
  validateAt,
  validateCron,
  validateEveryMinutes,
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

describe("describeCron", () => {
  it("reads step expressions and the plain hourly one", () => {
    expect(describeCron("*/15 * * * *")).toBe("every 15 minutes");
    expect(describeCron("0 */2 * * *")).toBe("every 2 hours");
    expect(describeCron("0 * * * *")).toBe("every hour");
    expect(describeCron("*/15 * * * 1")).toBeNull();
  });
  it("keeps the shapes it already knew", () => {
    expect(describeCron("0 9 * * *")).toBe("at 09:00, every day");
    expect(describeCron("0 9 * * 1-5")).toBe("at 09:00, on weekdays");
    expect(describeCron("0 9 * * 1")).toBe("at 09:00, every Monday");
    expect(describeCron("0 0 1 * *")).toBe("at 00:00, on day 1 of the month");
    expect(describeCron("5 * * * *")).toBe("at :05 every hour, every day");
    expect(describeCron("* * * * *")).toBe("every minute");
  });
});

describe("schedule draft", () => {
  const draft = (over: Partial<Parameters<typeof scheduleDraftError>[0]>) => ({
    kind: "cron" as const,
    expr: "0 9 * * *",
    tz: "",
    everyMin: "60",
    at: "",
    ...over,
  });
  it("validates whole minutes", () => {
    expect(validateEveryMinutes("1.5")).toBe("Whole minutes only");
    expect(validateEveryMinutes("0")).toBe("At least 1 minute");
    expect(validateEveryMinutes("")).toBe("Enter an interval in whole minutes");
    expect(validateEveryMinutes("5")).toBeNull();
  });
  it("validates a one-off time", () => {
    expect(validateAt("", NOW)).toBe("Pick a date and time");
    expect(validateAt("2020-01-01T00:00", NOW)).toBe("Pick a time in the future");
    expect(validateAt(toLocalInput(NOW + 120_000), NOW)).toBeNull();
  });
  it("applies one rule per kind", () => {
    expect(scheduleDraftError(draft({ expr: "" }), NOW)).toBe("Enter a cron expression");
    expect(scheduleDraftError(draft({ expr: "0 9 * * 8" }), NOW)).toMatch(/out of range/);
    expect(scheduleDraftError(draft({ kind: "every", everyMin: "1.5" }), NOW)).toBe("Whole minutes only");
    expect(scheduleDraftError(draft({ kind: "at", at: "" }), NOW)).toBe("Pick a date and time");
    expect(scheduleDraftError(draft({}), NOW)).toBeNull();
  });
  it("builds the schedule without rounding", () => {
    expect(buildSchedule(draft({ kind: "every", everyMin: "5" }))).toEqual({ kind: "every", every_ms: 300_000 });
    expect(buildSchedule(draft({ tz: " Asia/Jakarta " }))).toEqual({ kind: "cron", expr: "0 9 * * *", tz: "Asia/Jakarta" });
    expect(buildSchedule(draft({ tz: "" }))).toEqual({ kind: "cron", expr: "0 9 * * *", tz: undefined });
    const at = buildSchedule(draft({ kind: "at", at: toLocalInput(NOW + 120_000) }));
    expect(at.kind).toBe("at");
    if (at.kind === "at") expect(Date.parse(at.at)).toBe(NOW + 120_000);
  });
  it("previews in the operator's words", () => {
    expect(previewSchedule(draft({}))).toBe("Runs at 09:00, every day · UTC");
    expect(previewSchedule(draft({ tz: "Asia/Jakarta" }))).toBe("Runs at 09:00, every day · Asia/Jakarta");
    expect(previewSchedule(draft({ expr: "1 2 3 4 5" }))).toBe("Runs on the expression · UTC");
    expect(previewSchedule(draft({ kind: "every", everyMin: "5" }))).toBe("Runs every 5 minutes");
    expect(previewSchedule(draft({ kind: "at", at: toLocalInput(NOW + 120_000) }))).toMatch(
      /^Runs once at .*, then the job is removed$/,
    );
  });
  it("compares schedules by what they do", () => {
    expect(sameSchedule({ kind: "cron", expr: "0 9 * * *", tz: null }, { kind: "cron", expr: "0 9 * * *" })).toBe(true);
    expect(sameSchedule({ kind: "cron", expr: "0 9 * * *", tz: "UTC" }, { kind: "cron", expr: "0 9 * * *" })).toBe(false);
    expect(sameSchedule({ kind: "every", every_ms: 60_000 }, { kind: "every", every_ms: 60_000 })).toBe(true);
    expect(sameSchedule({ kind: "every", every_ms: 60_000 }, { kind: "cron", expr: "* * * * *" })).toBe(false);
  });
  it("round-trips a datetime-local value", () => {
    const local = toLocalInput(NOW);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(Date.parse(local)).toBe(Math.floor(NOW / 60_000) * 60_000);
    expect(toLocalInput(null)).toBe("");
  });
});

describe("firstLine", () => {
  it("takes the first line as plain text", () => {
    expect(firstLine("**bold**\n\n## h\ncode")).toBe("bold");
    expect(firstLine("You said: **hi**\n\n## Stub reply")).toBe("You said: hi");
    expect(firstLine("\n\n")).toBe("");
    expect(firstLine("x".repeat(200))).toHaveLength(120);
    expect(firstLine("x".repeat(200)).endsWith("…")).toBe(true);
  });
});

describe("cronVerdict", () => {
  const j = (over: Record<string, unknown>) => ({
    id: "x",
    name: null,
    enabled: true,
    next_run: ahead(3_600_000),
    last_run: null,
    schedule: cron,
    ...over,
  });
  const list = (jobs: ReturnType<typeof j>[], flags: Record<string, unknown> = {}) =>
    ({ jobs, count: jobs.length, cron_enabled: true, scheduler_enabled: true, ...flags }) as never;

  it("lets the feature switches outrank everything", () => {
    const v = cronVerdict(list([j({})], { cron_enabled: false, scheduler_enabled: false }), NOW);
    expect(v.headline).toBe("Cron is off");
    expect(v.tone).toBe("warn");
    const w = cronVerdict(list([j({})], { scheduler_enabled: false }), NOW);
    expect(w.headline).toBe("The scheduler loop is off");
  });

  it("treats missing flags as unknown, not off", () => {
    const v = cronVerdict(
      { jobs: [j({ name: "a" })], count: 1 } as never,
      NOW,
    );
    expect(v.headline).toBe("Next up: a");
    expect(v.tone).toBe("ok");
  });

  it("says so when the list is empty", () => {
    const v = cronVerdict(list([]), NOW);
    expect(v.headline).toBe("No scheduled jobs");
    expect(v.meta).toEqual([]);
  });

  it("leads with overdue when a due time went by", () => {
    const v = cronVerdict(list([j({ next_run: ago(10 * 60_000) }), j({ name: "b" })]), NOW);
    expect(v.headline).toBe("1 job overdue");
    expect(v.tone).toBe("warn");
    expect(v.meta).toContain("2 jobs");
    expect(v.meta).toContain("1 overdue");
  });

  it("names the soonest scheduled job when all is well", () => {
    const v = cronVerdict(
      list([
        j({ name: "later", next_run: ahead(7_200_000) }),
        j({ name: "sooner", next_run: ahead(1_800_000) }),
        j({ name: "asleep", enabled: false }),
      ]),
      NOW,
    );
    expect(v.headline).toBe("Next up: sooner");
    expect(v.tone).toBe("ok");
    expect(v.meta).toContain("3 jobs");
    expect(v.meta).toContain("1 paused");
  });

  it("says nothing is scheduled when every job is paused or spent", () => {
    const past = { kind: "at" as const, at: ago(60_000) };
    const v = cronVerdict(
      list([j({ enabled: false }), j({ enabled: false, schedule: past, next_run: past.at, last_run: past.at })]),
      NOW,
    );
    expect(v.headline).toBe("Nothing scheduled to run");
    expect(v.tone).toBe("warn");
  });
});
