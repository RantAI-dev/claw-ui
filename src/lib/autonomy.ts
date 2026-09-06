import type { GatewayAutonomy } from "./types";

/**
 * The policy vocabulary every surface shares: how a gateway `autonomy` object
 * maps onto the four-rung ladder, what a rung write sends, and what one tool
 * row says. The chat rail, the Status panel and the Tools panel all read the
 * rung through `rungFromAutonomy`, so they cannot disagree on one config.
 */

/**
 * The built-in tools the surfaces name when they talk about the rung. Mirrors
 * RantAIClaw `policy_writer.rs` BUILTIN_TOOLS; keep the two in step when a
 * built-in tool is added or renamed. These are registry names (each tool's
 * `fn name()`): the console used to list `web_search`, `send_message` and
 * `cron_schedule`, none of which exist, so a switch on them wrote a name the
 * approval gate never matched.
 */
export const BUILTIN_TOOLS: readonly string[] = [
  "shell",
  "file_read",
  "file_write",
  "web_search_tool",
  "memory_store",
  "memory_recall",
  "browser",
];

/** The always-ask entry the Manual preset writes: every tool prompts. */
export const WILDCARD = "*";

export type Rung = "manual" | "smart" | "strict" | "off";

/** Any object shaped like the gateway's `autonomy` block (or nothing yet). */
type AutonomyLike =
  | { level?: unknown; always_ask?: unknown; auto_approve?: unknown }
  | GatewayAutonomy
  | null
  | undefined;

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];

/** `readonly` / `ReadOnly` / `read_only` all mean the same level. */
function normLevel(level: unknown): string {
  return (typeof level === "string" ? level : "")
    .toLowerCase()
    .replace(/[_\-\s]/g, "");
}

export function hasWildcard(a: AutonomyLike): boolean {
  return list(a?.always_ask).includes(WILDCARD);
}

/**
 * The rung a config is on. `readonly` is Strict and `full` is Off from the
 * level alone. Supervised is Manual only when `always_ask` forces every
 * built-in tool to prompt (the wildcard, or the whole set by name); anything
 * less is Smart. Counting entries was wrong: a fresh install ships
 * `always_ask = ["ssh", "pty"]` beside `auto_approve = ["file_read",
 * "memory_recall"]`, and read as "Manual: prompt for every tool call" while
 * two tools ran without asking.
 */
export function rungFromAutonomy(a: AutonomyLike): Rung {
  const l = normLevel(a?.level);
  if (l === "readonly") return "strict";
  if (l === "full") return "off";
  const ask = list(a?.always_ask);
  const manual =
    ask.includes(WILDCARD) || BUILTIN_TOOLS.every((t) => ask.includes(t));
  return manual ? "manual" : "smart";
}

export interface AutonomyPayload {
  level: string;
  always_ask?: string[];
  auto_approve?: string[];
}

/**
 * What a rung write sends to `PUT /config/autonomy`.
 *
 * Manual writes the wildcard and clears `auto_approve`, exactly what the
 * CLI/TUI preset writer does, so "prompt for every tool call" covers every
 * tool in the registry and no stale auto-approve skips the prompt. Smart
 * keeps the always-ask entries outside the built-in set (`ssh`, `pty` by
 * default) and drops only the wildcard and the built-ins. Strict and Off are
 * unambiguous from the level and leave the lists as the operator has them.
 */
export function rungToAutonomyPayload(
  rung: string,
  current: AutonomyLike,
): AutonomyPayload {
  switch (rung) {
    case "manual":
      return { level: "supervised", always_ask: [WILDCARD], auto_approve: [] };
    case "strict":
      return { level: "readonly" };
    case "off":
      return { level: "full" };
    case "smart":
    default:
      return {
        level: "supervised",
        always_ask: list(current?.always_ask).filter(
          (t) => t !== WILDCARD && !BUILTIN_TOOLS.includes(t),
        ),
      };
  }
}

export type Outcome =
  | "always prompts"
  | "runs without asking"
  | "prompts"
  | "runs (Off: nothing prompts)"
  | "denied unless read-only (Strict)";

/**
 * What the runtime does with a call to `tool` under this config, in the
 * order it decides (RantAIClaw `approval/mod.rs` `needs_approval`): the
 * level first, then an always-ask match (the wildcard or the name), then
 * auto-approve, else the supervised default of a prompt.
 */
export function toolOutcome(tool: string, a: AutonomyLike): Outcome {
  const l = normLevel(a?.level);
  if (l === "full") return "runs (Off: nothing prompts)";
  if (l === "readonly") return "denied unless read-only (Strict)";
  const ask = list(a?.always_ask);
  if (ask.includes(WILDCARD) || ask.includes(tool)) return "always prompts";
  if (list(a?.auto_approve).includes(tool)) return "runs without asking";
  return "prompts";
}

/**
 * Whether the auto-approve switch for `tool` changes anything under this
 * config. Under Off nothing prompts, under Strict acting tools are denied,
 * and an always-ask match wins over auto-approve; a switch shown live in any
 * of those states says "runs without asking" for a call that prompts.
 */
export function autoApproveEffective(tool: string, a: AutonomyLike): boolean {
  const l = normLevel(a?.level);
  if (l === "full" || l === "readonly") return false;
  const ask = list(a?.always_ask);
  return !(ask.includes(WILDCARD) || ask.includes(tool));
}

/**
 * The rows the tool policy shows: the built-ins first, then every other name
 * the config mentions (so a default `ssh` / `pty` always-ask entry, or an
 * auto-approved `http_request`, is visible and not a hidden side effect).
 */
export function toolRows(a: AutonomyLike): string[] {
  const rows = [...BUILTIN_TOOLS];
  for (const t of [...list(a?.auto_approve), ...list(a?.always_ask)]) {
    if (t !== WILDCARD && !rows.includes(t)) rows.push(t);
  }
  return rows;
}

/**
 * What the gateway stores for an allowlist entry: the last path segment,
 * trimmed. The shell gate matches by basename, and `/usr/bin/git` used to be
 * toasted as allowed verbatim while `git` landed in the list a second time.
 */
export function commandBasename(input: string): string {
  const trimmed = input.trim();
  return (trimmed.split("/").pop() ?? "").trim();
}

/** Mirrors RantAIClaw `approval/permissions.rs` DANGEROUS. */
export const HIGH_RISK_COMMANDS: readonly string[] = [
  "rm",
  "dd",
  "mkfs",
  "sudo",
  "su",
  "chmod",
  "chown",
  "mount",
  "umount",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "curl",
  "wget",
  "nc",
  "ncat",
  "netcat",
  "bash",
  "sh",
  "zsh",
  "python",
  "python3",
  "perl",
  "ruby",
  "node",
];

export function isHighRiskCommand(base: string): boolean {
  return HIGH_RISK_COMMANDS.includes(base);
}

export interface CapsDraft {
  actions: string;
}

export interface CapsStored {
  actions: number | null;
}

export interface CapsChanges {
  /** The number a Save writes; null when nothing changed or the draft is invalid. */
  write: { max_actions_per_hour: number } | null;
  /** The draft differs from what is stored (a blank field over a stored value counts). */
  dirty: boolean;
  error: string | null;
}

/**
 * The field value for a stored config.
 *
 * The cost cap is gone. `autonomy.max_cost_per_day_cents` was a money ceiling
 * the backend never enforced — this panel said so on its own label — and it has
 * been replaced by `[cost] max_tokens_per_day`, which is enforced before every
 * turn and is not editable from here.
 */
export function capsSeed(stored: CapsStored): CapsDraft {
  return {
    actions: stored.actions != null ? String(stored.actions) : "",
  };
}

export function capsChanges(draft: CapsDraft, stored: CapsStored): CapsChanges {
  const at = draft.actions.trim();
  const actions = at === "" ? NaN : Math.round(Number(at));
  const dirty = actions !== stored.actions;
  let error: string | null = null;
  if (at === "") error = "Enter an actions cap";
  else if (!Number.isFinite(actions) || actions < 1)
    error = "Actions per hour must be at least 1";
  return {
    write: dirty && !error ? { max_actions_per_hour: actions } : null,
    dirty,
    error,
  };
}
