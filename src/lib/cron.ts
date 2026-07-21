// Cron expression helpers: human-readable description, quick-fill presets, and
// a client-side 5-field validator (mirrors the backend's 5-field cron syntax).

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
