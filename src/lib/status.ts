import type { DoctorResult } from "./types";

export interface ComponentHealth {
  name: string;
  status: string;
  lastOk: string | null;
  lastError: string | null;
  restartCount: number;
}

export interface RuntimeHealth {
  pid: number | null;
  uptimeSeconds: number | null;
  updatedAt: string | null;
  components: ComponentHealth[];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * The gateway's `/status.runtime` is its `health::snapshot_json()`:
 * `{ pid, uptime_seconds, updated_at, components: { <name>: { status,
 * updated_at, last_ok, last_error, restart_count } } }`. It can also be
 * `{ status: "error", message }` when the snapshot failed to serialize, or be
 * absent on an older gateway. Both return null so the panel can say so instead
 * of drawing an empty card.
 */
export function parseRuntimeHealth(runtime: unknown): RuntimeHealth | null {
  if (!runtime || typeof runtime !== "object") return null;
  const r = runtime as Record<string, unknown>;
  const raw = r.components;
  if (!raw || typeof raw !== "object") return null;
  const components: ComponentHealth[] = Object.entries(raw as Record<string, unknown>).map(
    ([name, c]) => {
      const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      return {
        name,
        status: str(o.status) ?? "unknown",
        lastOk: str(o.last_ok),
        lastError: str(o.last_error),
        restartCount: num(o.restart_count) ?? 0,
      };
    },
  );
  return {
    pid: num(r.pid),
    uptimeSeconds: num(r.uptime_seconds),
    updatedAt: str(r.updated_at),
    components,
  };
}

/** `32` → "32s", `3720` → "1h 2m", `200000` → "2d 7h". */
export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/**
 * `paired` means "the gateway holds at least one paired token". With pairing
 * required the console cannot load the Status panel unpaired (`check_auth`
 * answers 401), so a `false` here is only ever observed when pairing is not
 * required: a plain fact about the setup, not a warning.
 */
export function pairingLabel(paired: boolean): string {
  return paired ? "paired" : "not required";
}

/** Fail-like first, then warnings, info, ok; anything else last. Same
 *  spellings `SeverityBadge` understands. */
export function severityRank(severity: string): number {
  const s = severity.toLowerCase();
  if (s.includes("fail") || s.includes("err") || s.includes("crit")) return 0;
  if (s.includes("warn")) return 1;
  if (s.includes("info")) return 2;
  if (s.includes("ok") || s.includes("pass") || s.includes("healthy")) return 3;
  return 4;
}

/** Stable: rows of one severity keep their wire order. */
export function sortBySeverity(results: DoctorResult[]): DoctorResult[] {
  return results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => severityRank(a.r.severity) - severityRank(b.r.severity) || a.i - b.i)
    .map((x) => x.r);
}

/** "1 failed · 2 warnings · 1 info · 4 ok."; zero buckets are left out. */
export function doctorSummary(results: DoctorResult[]): string {
  if (results.length === 0) return "No checks reported.";
  const counts = [0, 0, 0, 0, 0];
  for (const r of results) counts[severityRank(r.severity)] += 1;
  const parts: string[] = [];
  if (counts[0]) parts.push(`${counts[0]} failed`);
  if (counts[1]) parts.push(`${counts[1]} ${counts[1] === 1 ? "warning" : "warnings"}`);
  if (counts[2]) parts.push(`${counts[2]} info`);
  if (counts[3]) parts.push(`${counts[3]} ok`);
  if (counts[4]) parts.push(`${counts[4]} other`);
  return `${parts.join(" · ")}.`;
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/**
 * "Three live checks were not run here (provider.ping, channels.auth,
 * mcp.startup)." for the gateway's brief-mode `skipped` list; null when nothing
 * was skipped. The caller appends what to do about it.
 */
export function skippedSentence(skipped: string[] | null | undefined): string | null {
  if (!skipped || skipped.length === 0) return null;
  const n = skipped.length;
  const count = n < WORDS.length ? WORDS[n] : String(n);
  const word = `${count.charAt(0).toUpperCase()}${count.slice(1)}`;
  return `${word} live ${n === 1 ? "check was" : "checks were"} not run here (${skipped.join(", ")}).`;
}

/** A value for a key/value row: the string when set, a word when not. */
export function emptyValue(v: string | null | undefined, word = "not set"): string {
  return v && v.trim() ? v : word;
}
