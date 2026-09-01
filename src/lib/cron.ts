// Cron helpers: human-readable descriptions, quick-fill presets, a client-side
// 5-field validator (mirrors the backend's 5-field syntax), the job/run state
// words, and the gateway sentences the panel has to read.

import type { CronJob, CronSchedule } from "./types";

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
 *  anything it can't describe confidently — the caller shows "custom schedule". */
export function describeCron(expr: string): string | null {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [min, hour, dom, mon, dow] = f;
  const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);
  const h = num(hour);
  const m = num(min);

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
  return ms == null ? String(ts) : new Date(ms).toLocaleString();
}

/** The browser's IANA zone, or "" when the runtime cannot tell. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
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
