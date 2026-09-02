import {
  AppWindow,
  Blocks,
  Brain,
  CalendarClock,
  Clock,
  Cpu,
  Database,
  FilePen,
  FileText,
  Globe,
  Library,
  type LucideIcon,
  MessagesSquare,
  Radio,
  Send,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  UserCog,
  Wrench,
  Activity as ActivityIcon,
} from "lucide-react";

/** The console's left-rail routes — Chat plus the real-wired ops views. */
export type Route =
  | "chat"
  | "status"
  | "channels"
  | "mcp"
  | "providers"
  | "tools"
  | "cron"
  | "skills"
  | "kb"
  | "kbgraph"
  | "memory"
  | "persona"
  | "config";

export interface NavDef {
  id: Route;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavDef[] = [
  { id: "chat", label: "Chat", icon: MessagesSquare },
  { id: "status", label: "Status", icon: ActivityIcon },
  { id: "channels", label: "Channels", icon: Radio },
  { id: "mcp", label: "MCP Servers", icon: Server },
  { id: "providers", label: "Providers", icon: Cpu },
  { id: "tools", label: "Tools & Autonomy", icon: ShieldCheck },
  { id: "cron", label: "Schedules", icon: CalendarClock },
  { id: "skills", label: "Skills", icon: Blocks },
  { id: "kb", label: "Knowledge Bases", icon: Library },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "persona", label: "Persona", icon: UserCog },
  { id: "config", label: "Configuration", icon: SlidersHorizontal },
];

/**
 * Broadcast by the Skills panel after it installs, removes, writes, or toggles
 * a skill. The nav badge is a snapshot the console shell takes once at load, so
 * without this it kept reporting the count from before the user's own edit.
 */
export const SKILLS_CHANGED = "rantaiclaw:skills-changed";

/**
 * Broadcast by the Persona panel after a successful save. The chat rail's agent
 * name/role/initials are a snapshot the console shell takes once at load, so
 * without this the rail shows the old identity until a full reload.
 */
export const PERSONA_CHANGED = "rantaiclaw:persona-changed";

/**
 * Broadcast by the Config panel after a temperature save, by the MCP panel
 * after it adds or removes a server, and by the Providers panel after a
 * provider / model / key / URL write. The right-rail temperature readout and the
 * MCP nav badge are snapshots the console shell takes once at load, and the
 * rail's provider and model come from a 15 s status poll, so without this they
 * keep showing the value from before the user's own edit. The shell re-reads
 * config and status on it. Listeners must only re-read (never re-dispatch) or
 * they loop.
 */
export const CONFIG_CHANGED = "rantaiclaw:config-changed";

/**
 * Broadcast once the gateway has confirmed an autonomy rung write, by the
 * chat rail and by the Tools panel. The rail, the Status panel and the Tools
 * panel each hold their own snapshot of the rung; without this a rung written
 * on one of them stayed stale on the others until a poll or a manual refresh
 * (the panel had neither). Listeners must only re-read (never re-dispatch) or
 * they loop.
 */
export const AUTONOMY_CHANGED = "rantaiclaw:autonomy-changed";

/** Legacy hash ids that resolve to a current route — the Knowledge Graph is now
 *  a lens inside Knowledge Bases, not a top-level route. */
const ROUTE_ALIASES: Record<string, Route> = { kbgraph: "kb" };

/** Map a URL hash to a live route: alias legacy ids, else the id if it is a real
 *  route, else null. */
export function resolveHashRoute(h: string): Route | null {
  // `Object.hasOwn`, not `in`: `in` walks the prototype chain, so a crafted
  // `#constructor` / `#__proto__` / `#toString` would resolve to an inherited
  // member and crash the route.
  if (Object.hasOwn(ROUTE_ALIASES, h)) return ROUTE_ALIASES[h];
  return NAV.some((n) => n.id === h) || Object.hasOwn(ROUTE_META, h)
    ? (h as Route)
    : null;
}

export const ROUTE_META: Record<Route, { title: string; eyebrow: string; blurb: string }> = {
  chat: { title: "Chat", eyebrow: "Conversation", blurb: "" },
  status: {
    title: "Status",
    eyebrow: "Runtime health",
    blurb: "Daemon health, doctor checks, and the runtime the agent is bound to.",
  },
  channels: {
    title: "Channels",
    eyebrow: "Connectivity",
    blurb: "Messaging surfaces the agent is reachable on, and who may talk to it.",
  },
  mcp: {
    title: "MCP Servers",
    eyebrow: "Model Context Protocol",
    blurb: "MCP servers wired into the runtime via config. Each exposes its own tool surface to the agent.",
  },
  tools: {
    title: "Tools & Autonomy",
    eyebrow: "Permissions",
    blurb: "The autonomy level and the policy that governs it: auto-approved tools, the shell allowlist, rate and cost caps, and forbidden paths.",
  },
  providers: {
    title: "Providers",
    eyebrow: "Models & keys",
    blurb: "Pick the provider and model the agent talks to, and store the provider's API key. The key is write-only: it is never shown back.",
  },
  cron: {
    title: "Schedules",
    eyebrow: "Automation",
    blurb:
      "Jobs the agent or the shell runs on a schedule: a cron expression, an interval or a one-off time. Create, edit, pause, run now, read the run history.",
  },
  skills: {
    title: "Skills",
    eyebrow: "Capabilities",
    blurb:
      "Standing instructions the agent follows. Write your own, install one from ClawHub, switch one off, or remove it.",
  },
  kb: {
    title: "Knowledge Bases",
    eyebrow: "Retrieval",
    blurb: "Grouped document collections the agent can retrieve from. Create a base, upload files into it, remove them, and read what the entity graph found.",
  },
  kbgraph: {
    title: "Knowledge Graph",
    eyebrow: "Entity relationships",
    blurb: "The entity-and-relation graph extracted across your knowledge bases: how people, organizations, and concepts connect.",
  },
  memory: {
    title: "Memory",
    eyebrow: "Long-term recall",
    blurb: "Facts and preferences the agent keeps, plus turns saved from conversations.",
  },
  persona: {
    title: "Persona",
    eyebrow: "Voice & behavior",
    blurb: "Who the agent says it is on every system prompt, and the knowledge it always carries.",
  },
  config: {
    title: "Configuration",
    eyebrow: "Live config",
    blurb: "Tune the default sampling temperature and inspect the running config with secrets masked.",
  },
};

/** Autonomy presets — mirrors the RantaiClaw README ladder. */
export interface AutonomyPreset {
  id: string;
  label: string;
  blurb: string;
  dot: string;
}

export const AUTONOMY: AutonomyPreset[] = [
  { id: "manual", label: "Manual", blurb: "Prompt for every tool call. Safest.", dot: "var(--accent-red)" },
  {
    id: "smart",
    label: "Smart",
    blurb: "Prompt only for writes & system changes. Recommended.",
    dot: "var(--brand-sky)",
  },
  {
    id: "strict",
    label: "Strict",
    blurb: "Deny-by-default. Shell unregistered: describes, doesn't run.",
    dot: "var(--accent-purple)",
  },
  { id: "off", label: "Off", blurb: "Autonomous execution, no prompts. Trusted envs only.", dot: "var(--accent-green)" },
];

/**
 * The rung Shift+Tab should move to from `current`.
 *
 * `off` — "autonomous execution, no prompts" — is deliberately unreachable by
 * cycling: the binding is one keypress with no confirmation, fired from any
 * non-editable focus. Selecting it stays possible from the autonomy menu.
 * Returns `null` when there is nothing to move to, which is also the signal not
 * to `preventDefault()` — the unconditional call broke reverse-tab navigation
 * everywhere in the console.
 */
export function nextCycledRung(current: string): string | null {
  const cyclable = AUTONOMY.filter((p) => p.id !== "off").map((p) => p.id);
  if (cyclable.length === 0) return null;
  const at = cyclable.indexOf(current);
  // Cycling out of `off` lands on the safest rung rather than staying put.
  if (at === -1) return cyclable[0];
  return cyclable[(at + 1) % cyclable.length];
}

/**
 * Whether ⇧⇥ should cycle autonomy from this focus, instead of doing what
 * Shift+Tab does everywhere else on the web — move focus backwards.
 *
 * It claims the key only when nothing interactive holds focus, or when focus is
 * already inside the autonomy control the ⇧⇥ hint is printed on. The guard used
 * to exempt only text fields and dialogs, so from a button, a link or a rail
 * item the binding fired and `preventDefault()` swallowed the key: reverse-tab
 * stopped working across the console, and each press moved an approval-gating
 * setting with no confirmation. A keyboard user tabbing backwards out of the
 * page had no way to know they had changed it.
 *
 * `railSelector` is the autonomy control's own container — focus inside it is a
 * deliberate context, so cycling there is what the printed hint promises.
 */
export function shiftTabCyclesAutonomy(
  active: Element | null,
  hasDialog: boolean,
  railSelector = ".auto-pick",
): boolean {
  if (hasDialog) return false;
  // Nothing interactive is focused, so the key has no reverse-tab work to do.
  if (!active || active.tagName === "BODY" || active.tagName === "HTML") {
    return true;
  }
  return !!active.closest(railSelector);
}

/**
 * Whether a config read that began at `readStartedAt` should be discarded
 * because a local write has since claimed the value.
 *
 * The write stamp used to be set in `.finally()`, so a **failed** write armed
 * the guard and discarded the very read that would have corrected the screen —
 * leaving the console showing a rung the gateway is not on, for up to the
 * 30-second poll (which also stops while the tab is hidden).
 */
export function autonomyReadIsStale(readStartedAt: number, writtenAt: number): boolean {
  return readStartedAt < writtenAt;
}

/** Gateway `autonomy.level` names → the preset ladder. */
const AUTONOMY_ALIAS: Record<string, string> = {
  supervised: "smart",
  autonomous: "off",
  full: "off",
  plan: "strict",
  "read-only": "strict",
};

export function autonomyPreset(id: string | null | undefined): AutonomyPreset {
  const key = (id || "").toLowerCase();
  const norm = AUTONOMY_ALIAS[key] || key;
  return AUTONOMY.find((p) => p.id === norm) || AUTONOMY[1];
}

/** Accent palettes for the Tweaks panel (brand-sky + deep-blue pair). */
export const ACCENTS: Record<string, { sky: string; deep: string }> = {
  Sky: { sky: "#5eb6fa", deep: "#055794" },
  Cobalt: { sky: "#3b82f6", deep: "#0d3b8a" },
  Teal: { sky: "#4fb8c9", deep: "#1f5563" },
  Violet: { sky: "#8b7ee8", deep: "#574399" },
};

/** The default accent key for the active brand (first swatch). */
export const DEFAULT_ACCENT = Object.keys(ACCENTS)[0];

/** A stable colored dot for a channel id/name. */
const CHANNEL_DOT: Record<string, string> = {
  cli: "var(--brand-sky)",
  slack: "var(--accent-purple)",
  discord: "var(--accent-cornflower)",
  telegram: "var(--brand-deep-blue)",
  whatsapp: "var(--accent-green)",
  matrix: "var(--accent-teal)",
  email: "var(--accent-orange)",
  signal: "var(--accent-seagreen)",
  github: "var(--accent-orange)",
};

export function channelDot(id: string): string {
  return CHANNEL_DOT[id.toLowerCase()] || "var(--muted-foreground)";
}

const TOOL_ICON: Record<string, LucideIcon> = {
  memory_recall: Brain,
  memory_store: Database,
  file_read: FileText,
  file_write: FilePen,
  shell: Terminal,
  web_search: Globe,
  send_message: Send,
  cron_schedule: Clock,
  browser: AppWindow,
  composio: Blocks,
};

export function toolIcon(name: string): LucideIcon {
  return TOOL_ICON[name.toLowerCase()] || Wrench;
}

/** Two-letter avatar initials from a name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AI";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const MASK = "••••••••";
/** Provider key prefixes, mirroring RantAIClaw `config/api_url.rs` API_KEY_PREFIXES. */
const API_KEY_PREFIXES = ["sk-", "sk_", "gsk_", "xai-", "AIza", "hf_"];
const SECRET_FLAG_WORDS = ["key", "token", "secret", "password"];

function looksLikeApiKey(value: string): boolean {
  const v = value.trim();
  return API_KEY_PREFIXES.some((p) => v.startsWith(p));
}

/**
 * Mask credential-shaped MCP launch args, mirroring the gateway's
 * `redact_mcp_args`: the value after a `--flag` whose name contains
 * key/token/secret/password (both `--flag value` and `--flag=value` forms),
 * and any bare arg that starts like a provider key. Parity with the gateway,
 * not perfection: `--max-keys 10` masks the 10 on both sides.
 */
function maskMcpArgs(args: unknown[]): unknown[] {
  let maskNext = false;
  return args.map((raw) => {
    if (typeof raw !== "string") {
      maskNext = false;
      return raw;
    }
    if (maskNext) {
      maskNext = false;
      return MASK;
    }
    if (looksLikeApiKey(raw)) return MASK;
    if (raw.startsWith("--")) {
      const flag = raw.toLowerCase();
      if (SECRET_FLAG_WORDS.some((k) => flag.includes(k))) {
        const eq = raw.indexOf("=");
        if (eq >= 0) return raw.slice(0, eq + 1) + MASK;
        maskNext = true;
      }
    }
    return raw;
  });
}

/**
 * A config dump safe to put on screen.
 *
 * The backend redacts by key-name suffix, which cannot cover
 * `mcp_servers.*.env` — those are arbitrary operator-chosen names holding
 * arbitrary values, and API keys live there routinely — nor arg values
 * (`npx server --api-key sk-…` has no key name to match). This masks the env
 * **values**, credential-shaped **arg values**, and a key-shaped **command**
 * client-side; key and flag names stay, so the operator can still see what is
 * set. Gateways released after v0.25 blank the same set server-side; this is
 * the client-side floor for the older ones.
 */
export function maskConfigForDisplay(config: unknown): unknown {
  if (!config || typeof config !== "object") return config;
  const clone = structuredClone(config) as Record<string, unknown>;
  const servers = clone.mcp_servers;
  if (!servers || typeof servers !== "object") return clone;
  for (const server of Object.values(servers as Record<string, unknown>)) {
    if (!server || typeof server !== "object") continue;
    const s = server as Record<string, unknown>;
    const env = s.env;
    if (env && typeof env === "object") {
      for (const key of Object.keys(env as Record<string, unknown>)) {
        (env as Record<string, unknown>)[key] = MASK;
      }
    }
    if (Array.isArray(s.args)) s.args = maskMcpArgs(s.args);
    if (typeof s.command === "string" && looksLikeApiKey(s.command)) s.command = MASK;
  }
  return clone;
}
