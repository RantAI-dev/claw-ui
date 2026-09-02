// Cron helpers: human-readable descriptions, quick-fill presets, a client-side
// 5-field validator (mirrors the backend's 5-field syntax), the job/run state
// words, and the gateway sentences the panel has to read.

import type { CronJob, CronList, CronSchedule } from "./types";

export const DOW = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Best-effort plain-English summary of a 5-field cron expr. Returns null for
 *  anything it can't describe confidently: the caller shows "custom schedule". */
export function describeCron(expr: string): string | null {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [min, hour, dom, mon, dow] = f;
  const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);
  const h = num(hour);
  const m = num(min);
  const step = (s: string) => {
    const r = /^\*\/(\d+)$/.exec(s);
    return r ? Number(r[1]) : null;
  };

  if (dom === "*" && mon === "*" && dow === "*") {
    const ms = step(min);
    const hs = step(hour);
    if (ms != null && hour === "*") return `every ${ms} minutes`;
    if (hs != null && min === "0") return `every ${hs} hours`;
    if (min === "0" && hour === "*") return "every hour";
  }

  let time: string;
  if (min === "*" && hour === "*") return "every minute";
  else if (h != null && m != null && h < 24 && m < 60)
    time = `at ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  else if (hour === "*" && m != null && m < 60)
    time = `at :${String(m).padStart(2, "0")} every hour`;
  else return null;

  let day: string;
  if (dom === "*" && mon === "*" && dow === "*") day = "every day";
  else if (dom === "*" && mon === "*" && dow === "1-5") day = "on weekdays";
  else if (dom === "*" && mon === "*" && num(dow) != null && num(dow)! <= 6)
    day = `every ${DOW[num(dow)!]}`;
  else if (num(dom) != null && mon === "*" && dow === "*")
    day = `on day ${num(dom)} of the month`;
  else return null;

  return `${time}, ${day}`;
}

export const CRON_PRESETS: { label: string; expr: string }[] = [
  { label: "Every hour", expr: "0 * * * *" },
  { label: "Every day at 9:00", expr: "0 9 * * *" },
  { label: "Weekdays at 9:00", expr: "0 9 * * 1-5" },
  { label: "Every Monday 9:00", expr: "0 9 * * 1" },
  { label: "1st of month 00:00", expr: "0 0 1 * *" },
  { label: "Every 15 minutes", expr: "*/15 * * * *" },
];

/** Validate a 5-field cron expression. Returns null if valid, else a message. */
export function validateCron(expr: string): string | null {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return "Cron needs 5 fields: min hour day month weekday";
  const ranges: [number, number][] = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ];
  for (let i = 0; i < 5; i++) {
    if (!validField(f[i], ranges[i][0], ranges[i][1]))
      return `Field ${i + 1} ("${f[i]}") is out of range`;
  }
  return null;
}

function validField(field: string, min: number, max: number): boolean {
  if (field === "*") return true;
  return field.split(",").every((part) => {
    const [range, step] = part.split("/");
    if (step !== undefined && !/^\d+$/.test(step)) return false;
    if (range === "*") return true;
    const [a, b] = range.split("-");
    if (!/^\d+$/.test(a) || Number(a) < min || Number(a) > max) return false;
    if (b !== undefined && (!/^\d+$/.test(b) || Number(b) < Number(a) || Number(b) > max))
      return false;
    return true;
  });
}

// ---- Times ----

/** Epoch milliseconds for a gateway timestamp (RFC 3339, epoch seconds or
 *  epoch milliseconds), or null when it is absent or unreadable. */
export function whenMs(ts: string | number | null | undefined): number | null {
  if (ts == null) return null;
  const ms = typeof ts === "number" ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

/** A gateway timestamp in the browser's locale and zone; "not yet" when absent. */
export function fmtWhen(ts: string | number | null | undefined): string {
  if (ts == null) return "not yet";
  const ms = whenMs(ts);
  if (ms == null) return String(ts);
  // Minute precision: a schedule's times read as appointments, not log lines.
  return new Date(ms).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

/** The browser's IANA zone, or "" when the runtime cannot tell. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

/** A gateway timestamp as the value of a `datetime-local` input (local
 *  wall-clock, minute precision); "" when unreadable. */
export function toLocalInput(ts: string | number | null | undefined): string {
  const ms = whenMs(ts);
  if (ms == null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---- Schedules ----

/** "every 5 min" / "every 30 s" / "every 1500 ms"; `long` spells the unit out. */
export function formatEvery(ms: number, long = false): string {
  if (ms > 0 && ms % 60_000 === 0) {
    const m = ms / 60_000;
    return m === 1 ? "every minute" : `every ${m} ${long ? "minutes" : "min"}`;
  }
  if (ms > 0 && ms % 1000 === 0) {
    const s = ms / 1000;
    return `every ${s} ${long ? (s === 1 ? "second" : "seconds") : "s"}`;
  }
  return `every ${ms} ms`;
}

/** Mirrors the Rust `Display for Schedule`. The stored `expression` string is
 *  empty for at/every jobs, so render from the structured `schedule`. */
export function formatSchedule(s: CronSchedule): string {
  switch (s.kind) {
    case "cron":
      return s.tz ? `${s.expr} (${s.tz})` : s.expr;
    case "at":
      return `once at ${fmtWhen(s.at)}`;
    case "every":
      return formatEvery(s.every_ms);
  }
}

/** Two schedules that would run the same way (a blank zone equals no zone). */
export function sameSchedule(a: CronSchedule, b: CronSchedule): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "cron" && b.kind === "cron")
    return a.expr.trim() === b.expr.trim() && (a.tz || "") === (b.tz || "");
  if (a.kind === "every" && b.kind === "every") return a.every_ms === b.every_ms;
  if (a.kind === "at" && b.kind === "at") return whenMs(a.at) === whenMs(b.at);
  return false;
}

// ---- The create / edit draft: one rule for the three kinds ----

export interface ScheduleDraft {
  kind: CronSchedule["kind"];
  expr: string;
  tz: string;
  everyMin: string;
  at: string;
}

export function validateEveryMinutes(s: string): string | null {
  const t = s.trim();
  if (!t) return "Enter an interval in whole minutes";
  if (!/^\d+$/.test(t)) return "Whole minutes only";
  if (Number(t) < 1) return "At least 1 minute";
  return null;
}

export function validateAt(s: string, now: number): string | null {
  const ms = s.trim() ? Date.parse(s) : NaN;
  if (!Number.isFinite(ms)) return "Pick a date and time";
  if (ms <= now) return "Pick a time in the future";
  return null;
}

/** The inline sentence for a draft that does not build yet, or null. */
export function scheduleDraftError(d: ScheduleDraft, now: number): string | null {
  switch (d.kind) {
    case "cron":
      return d.expr.trim() ? validateCron(d.expr) : "Enter a cron expression";
    case "every":
      return validateEveryMinutes(d.everyMin);
    case "at":
      return validateAt(d.at, now);
  }
}

/** True while the kind's own field is still empty: the sentence is guidance,
 *  not a mistake. */
export function scheduleDraftEmpty(d: ScheduleDraft): boolean {
  switch (d.kind) {
    case "cron":
      return !d.expr.trim();
    case "every":
      return !d.everyMin.trim();
    case "at":
      return !d.at.trim();
  }
}

/** The schedule a valid draft builds (call after `scheduleDraftError` is null). */
export function buildSchedule(d: ScheduleDraft): CronSchedule {
  switch (d.kind) {
    case "cron":
      return { kind: "cron", expr: d.expr.trim(), tz: d.tz.trim() || undefined };
    case "every":
      return { kind: "every", every_ms: Number(d.everyMin.trim()) * 60_000 };
    case "at":
      return { kind: "at", at: new Date(Date.parse(d.at)).toISOString() };
  }
}

/** What a valid draft will do, in the operator's words. */
export function previewSchedule(d: ScheduleDraft): string {
  switch (d.kind) {
    case "cron": {
      const words = describeCron(d.expr);
      return `Runs ${words ?? "on the expression"} · ${d.tz.trim() || "UTC"}`;
    }
    case "every":
      return `Runs ${formatEvery(Number(d.everyMin.trim()) * 60_000, true)}`;
    case "at":
      return `Runs once at ${fmtWhen(Date.parse(d.at))}, then the job is removed`;
  }
}

/** The first line of a run's output as plain text (markdown marks stripped),
 *  trimmed to `max` characters: the toast's receipt; the history has the rest. */
export function firstLine(output: string, max = 120): string {
  const line =
    output
      .split(/\r?\n/)
      .map((l) =>
        l
          .replace(/^[#>*\-`\s]+/, "")
          .replace(/[*`_]+/g, "")
          .trim(),
      )
      .find((l) => l.length > 0) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// ---- Job and run state ----

/** How stale a due time may be before the row says "overdue": four polls of the
 *  scheduler's default 15 s tick. */
export const OVERDUE_GRACE_MS = 60_000;

export type JobState = "scheduled" | "overdue" | "paused" | "ran-once" | "missed";

/** What the row says about a job right now. A disabled job is "paused", except
 *  a one-off whose time has passed: "ran-once" when a run was recorded, else
 *  "missed". An enabled job whose due time is older than the grace is
 *  "overdue" (the scheduler loop lives in the daemon; the console cannot see
 *  whether it is running, only that the time went by). */
export function jobState(
  job: Pick<CronJob, "enabled" | "next_run" | "last_run" | "schedule">,
  now: number,
): JobState {
  if (!job.enabled) {
    if (job.schedule.kind === "at") {
      const at = whenMs(job.schedule.at);
      if (at != null && at <= now) return job.last_run ? "ran-once" : "missed";
    }
    return "paused";
  }
  const next = whenMs(job.next_run);
  if (next != null && next < now - OVERDUE_GRACE_MS) return "overdue";
  return "scheduled";
}

/** One vocabulary for `last_status` (ok/error) and run rows (ok/refused/error). */
export function statusWord(status: string | null | undefined): string {
  if (!status) return "";
  const s = status.toLowerCase();
  return s === "error" ? "failed" : s;
}

export function statusTone(
  status: string | null | undefined,
): "secondary" | "destructive" | "warning" {
  const s = (status ?? "").toLowerCase();
  if (s === "ok") return "secondary";
  if (s === "error") return "destructive";
  return "warning";
}

// ---- Gateway sentences the panel reads ----

export const POLICY_PREFIX = "blocked by security policy: ";

/** The reason behind a policy refusal, or null when the output is not one. */
export function refusalReason(output: string): string | null {
  const t = output.trim();
  return t.toLowerCase().startsWith(POLICY_PREFIX) ? t.slice(POLICY_PREFIX.length).trim() : null;
}

/** The create warning reads "created, but will not run on its schedule
 *  (<reason>); force-run it with an approval, …". The console cannot force-run
 *  anything (the approval is inert at fire time), so it shows the reason and
 *  drops the advice. Any other shape is returned as is. */
export function createWarningReason(warning: string): string {
  const m = /^created, but will not run on its schedule \((.+)\); force-run/i.exec(warning.trim());
  return m ? m[1] : warning.trim();
}

/** The gateway refuses `enabled: true` on a one-off whose time has passed. */
export function isPastOneOffRefusal(message: string): boolean {
  return /cannot re-enable one-shot/i.test(message);
}

export const PAST_ONE_OFF = "This one-off's time has passed. Edit it with a new time to run it again.";

/** A job's display name: its own, or the id's first block. */
export function jobLabel(j: Pick<CronJob, "id" | "name">): string {
  return j.name || j.id.slice(0, 8);
}

/** The tone dot beside a run outcome, from the topbar pill's colour set. */
export function statusDotColor(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "ok") return "var(--accent-green)";
  if (s === "error") return "var(--accent-red)";
  return "var(--accent-orange)";
}

// ---- The page's verdict ----

export interface CronVerdict {
  headline: string;
  tone: "ok" | "warn";
  /** Mono metadata line, joined with a dot. */
  meta: string[];
  detail?: string;
}

/** The answer the page opens with: whether the schedule is running, and what
 *  fires next. Feature switches outrank everything; overdue outranks the
 *  happy path; a list with nothing armed says so. */
export function cronVerdict(
  list: Pick<CronList, "jobs" | "count" | "cron_enabled" | "scheduler_enabled">,
  now: number,
): CronVerdict {
  let paused = 0;
  let overdue = 0;
  let next: { label: string; at: number } | null = null;
  for (const j of list.jobs) {
    const st = jobState(j, now);
    if (st === "overdue") overdue += 1;
    else if (st !== "scheduled") paused += 1;
    if (st === "scheduled") {
      const at = whenMs(j.next_run);
      if (at != null && (next == null || at < next.at)) next = { label: jobLabel(j), at };
    }
  }
  const meta = [`${list.count} job${list.count === 1 ? "" : "s"}`];
  if (paused > 0) meta.push(`${paused} paused`);
  if (overdue > 0) meta.push(`${overdue} overdue`);
  if (list.cron_enabled === false) {
    return {
      headline: "Cron is off",
      tone: "warn",
      meta,
      detail: "cron.enabled=false: jobs are read-only here, and nothing fires until it is re-enabled.",
    };
  }
  if (list.scheduler_enabled === false) {
    return {
      headline: "The scheduler loop is off",
      tone: "warn",
      meta,
      detail: "scheduler.enabled=false: these jobs will not fire until it is re-enabled.",
    };
  }
  if (list.count === 0) {
    return {
      headline: "No scheduled jobs",
      tone: "warn",
      meta: [],
      detail:
        "Create the first one with the New job form. Jobs fire from the RantaiClaw daemon while it is running.",
    };
  }
  if (overdue > 0) {
    return {
      headline: `${overdue} job${overdue === 1 ? "" : "s"} overdue`,
      tone: "warn",
      meta,
      detail:
        "A due time passed with no run recorded. Jobs fire from the RantaiClaw daemon; check that it is running.",
    };
  }
  if (next == null) {
    return {
      headline: "Nothing scheduled to run",
      tone: "warn",
      meta,
      detail: "Every job is paused or already ran; resume one or create a new job.",
    };
  }
  return { headline: `Next up: ${next.label}`, tone: "ok", meta: [fmtWhen(next.at), ...meta] };
}
