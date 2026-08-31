import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a unix-seconds-or-ms timestamp into a short relative string. */
export function relativeTime(ts: number | string | null | undefined): string {
  if (ts == null) return "";
  let ms = typeof ts === "string" ? Number(ts) : ts;
  // ISO 8601 strings (e.g. "2026-06-04T16:49:15Z") aren't numeric — parse them.
  if (typeof ts === "string" && !Number.isFinite(ms)) ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return String(ts);
  // Heuristic: treat 10-digit values as seconds.
  if (ms < 1e12) ms *= 1000;
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

/** Config temperatures arrive as f32 widened to f64 (0.699999988…); show them
 *  the way they were typed. */
export function formatTemperature(n: number): string {
  return String(Number(n.toPrecision(3)));
}

export function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}
