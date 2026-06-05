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
import { brand } from "@/lib/branding";

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
  { id: "skills", label: "ClawHub Skills", icon: Blocks },
  { id: "kb", label: "Knowledge Bases", icon: Library },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "persona", label: "Persona", icon: UserCog },
  { id: "config", label: "Configuration", icon: SlidersHorizontal },
];

export const ROUTE_META: Record<Route, { title: string; eyebrow: string; dot: string; blurb: string }> = {
  chat: { title: "Chat", eyebrow: "Conversation", dot: "var(--brand-sky)", blurb: "" },
  status: {
    title: "Status",
    eyebrow: "Runtime health",
    dot: "var(--accent-green)",
    blurb: "Daemon health, doctor checks, and the runtime the agent is bound to.",
  },
  channels: {
    title: "Channels",
    eyebrow: "Connectivity",
    dot: "var(--accent-purple)",
    blurb: "Messaging surfaces the agent is reachable on — Slack, Discord, Telegram, email and more.",
  },
  mcp: {
    title: "MCP Servers",
    eyebrow: "Model Context Protocol",
    dot: "var(--accent-teal)",
    blurb: "MCP servers wired into the runtime via config — each exposes its own tool surface to the agent.",
  },
  tools: {
    title: "Tools & Autonomy",
    eyebrow: "Permissions",
    dot: "var(--accent-orange)",
    blurb: "The autonomy level and the policy that governs it — auto-approved tools, the shell allowlist, rate and cost caps, and forbidden paths.",
  },
  providers: {
    title: "Providers",
    eyebrow: "Models & keys",
    dot: "var(--brand-sky)",
    blurb: "Pick the active model provider and store its API key — encrypted at rest, never shown back.",
  },
  cron: {
    title: "Schedules",
    eyebrow: "Automation",
    dot: "var(--accent-orange)",
    blurb: "Recurring agent jobs on cron expressions — create, pause, run now, or delete.",
  },
  skills: {
    title: "ClawHub Skills",
    eyebrow: "Capabilities",
    dot: "var(--accent-cornflower)",
    blurb: "Installed skills and the ClawHub marketplace — install, enable, and remove capabilities.",
  },
  kb: {
    title: "Knowledge Bases",
    eyebrow: "Retrieval",
    dot: "var(--brand-sky)",
    blurb: "Grouped document collections the agent can retrieve from — upload files, organize, and pick which bases a chat draws on.",
  },
  memory: {
    title: "Memory",
    eyebrow: "Long-term recall",
    dot: "var(--accent-purple)",
    blurb: "Facts and preferences the agent has persisted across conversations.",
  },
  persona: {
    title: "Persona",
    eyebrow: "Voice & behavior",
    dot: "var(--accent-teal)",
    blurb: "The personality preset that shapes the agent's tone and defaults.",
  },
  config: {
    title: "Configuration",
    eyebrow: "Live config",
    dot: "var(--accent-green)",
    blurb: "Hot-swap the default model and inspect the running config (secrets redacted).",
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

/** Accent palettes for the Tweaks panel (brand-sky + deep-blue pair).
 * Brand-aware so the default accent matches the active brand (Nexus = orange). */
export const ACCENTS: Record<string, { sky: string; deep: string }> =
  brand.id === "nexus"
    ? {
        Orange: { sky: "#ff5001", deep: "#b83800" },
        Amber: { sky: "#f59e0b", deep: "#b45309" },
        Crimson: { sky: "#ef4444", deep: "#991b1b" },
        Violet: { sky: "#8b5cf6", deep: "#5b21b6" },
      }
    : {
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
