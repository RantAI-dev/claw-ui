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

/** Legacy hash ids that resolve to a current route — the Knowledge Graph is now
 *  a lens inside Knowledge Bases, not a top-level route. */
const ROUTE_ALIASES: Record<string, Route> = { kbgraph: "kb" };

/** Map a URL hash to a live route: alias legacy ids, else the id if it is a real
 *  route, else null. */
export function resolveHashRoute(h: string): Route | null {
  if (h in ROUTE_ALIASES) return ROUTE_ALIASES[h];
  return NAV.some((n) => n.id === h) || h in ROUTE_META ? (h as Route) : null;
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
    blurb: "Messaging surfaces the agent is reachable on — Slack, Discord, Telegram, email and more.",
  },
  mcp: {
    title: "MCP Servers",
    eyebrow: "Model Context Protocol",
    blurb: "MCP servers wired into the runtime via config — each exposes its own tool surface to the agent.",
  },
  tools: {
    title: "Tools & Autonomy",
    eyebrow: "Permissions",
    blurb: "The autonomy level and the policy that governs it — auto-approved tools, the shell allowlist, rate and cost caps, and forbidden paths.",
  },
  providers: {
    title: "Providers",
    eyebrow: "Models & keys",
    blurb: "Pick the active model provider and store its API key — encrypted at rest, never shown back.",
  },
  cron: {
    title: "Schedules",
    eyebrow: "Automation",
    blurb: "Recurring agent jobs on cron expressions — create, pause, run now, or delete.",
  },
  skills: {
    title: "Skills",
    eyebrow: "Capabilities",
    blurb: "Skills the agent can use — write your own, or install them from the ClawHub marketplace.",
  },
  kb: {
    title: "Knowledge Bases",
    eyebrow: "Retrieval",
    blurb: "Grouped document collections the agent can retrieve from — upload files, organize, and pick which bases a chat draws on.",
  },
  kbgraph: {
    title: "Knowledge Graph",
    eyebrow: "Entity relationships",
    blurb: "The entity-and-relation graph extracted across your knowledge bases — explore how people, organizations, and concepts connect.",
  },
  memory: {
    title: "Memory",
    eyebrow: "Long-term recall",
    blurb: "Facts and preferences the agent has persisted across conversations.",
  },
  persona: {
    title: "Persona",
    eyebrow: "Voice & behavior",
    blurb: "The personality preset that shapes the agent's tone and defaults.",
  },
  config: {
    title: "Configuration",
    eyebrow: "Live config",
    blurb: "Tune the default sampling temperature and inspect the running config (secrets redacted).",
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
    blurb: "Deny-by-default. Shell unregistered — describes, doesn't run.",
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

/** The built-in tool names the agent can be granted/denied. */
export const BUILTIN_TOOLS = [
  "shell",
  "file_read",
  "file_write",
  "web_search",
  "memory_store",
  "memory_recall",
  "send_message",
  "cron_schedule",
  "browser",
];

/** Map a design autonomy rung → a gateway `/config/autonomy` PATCH payload.
 * The gateway has 3 real levels (readonly/supervised/full); the 4-rung ladder
 * distinguishes Manual vs Smart by whether every tool is forced to always-ask. */
export function rungToAutonomyPayload(rung: string): {
  level: string;
  always_ask?: string[];
} {
  switch (rung) {
    case "manual":
      return { level: "supervised", always_ask: BUILTIN_TOOLS };
    case "strict":
      return { level: "readonly" };
    case "off":
      return { level: "full" };
    case "smart":
    default:
      return { level: "supervised", always_ask: [] };
  }
}

/** Infer the design rung from the gateway level + how many tools are always-ask. */
export function levelToRung(level: string | null | undefined, alwaysAskCount = 0): string {
  const l = (level || "").toLowerCase().replace(/[_\-\s]/g, "");
  if (l === "readonly") return "strict";
  if (l === "full") return "off";
  return alwaysAskCount > 0 ? "manual" : "smart";
}

/** Two-letter avatar initials from a name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AI";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * A config dump safe to put on screen.
 *
 * The backend redacts by key-name suffix, which cannot cover
 * `mcp_servers.*.env` — those are arbitrary operator-chosen names holding
 * arbitrary values, and API keys live there routinely. The panel's label said
 * "secrets redacted" over exactly that gap. This masks the env **values**
 * client-side; the key names stay, so the operator can still see what is set.
 */
export function maskConfigForDisplay(config: unknown): unknown {
  if (!config || typeof config !== "object") return config;
  const clone = structuredClone(config) as Record<string, unknown>;
  const servers = clone.mcp_servers;
  if (!servers || typeof servers !== "object") return clone;
  for (const server of Object.values(servers as Record<string, unknown>)) {
    if (!server || typeof server !== "object") continue;
    const env = (server as Record<string, unknown>).env;
    if (!env || typeof env !== "object") continue;
    for (const key of Object.keys(env as Record<string, unknown>)) {
      (env as Record<string, unknown>)[key] = "••••••••";
    }
  }
  return clone;
}
