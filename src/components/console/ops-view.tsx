"use client";

import * as React from "react";
import { ROUTE_META, type Route } from "@/lib/console";
import type { Connection } from "@/hooks/use-gateway-status";
import {
  ChannelsPanel,
  ConfigPanel,
  CronPanel,
  KbPanel,
  McpPanel,
  MemoryPanel,
  PersonaPanel,
  ProvidersPanel,
  SkillsPanel,
  StatusPanel,
  ToolsPanel,
} from "@/components/ops/panels";

const PANELS: Partial<Record<Route, React.ReactNode>> = {
  status: <StatusPanel />,
  channels: <ChannelsPanel />,
  mcp: <McpPanel />,
  providers: <ProvidersPanel />,
  tools: <ToolsPanel />,
  cron: <CronPanel />,
  skills: <SkillsPanel />,
  kb: <KbPanel />,
  memory: <MemoryPanel />,
  persona: <PersonaPanel />,
  config: <ConfigPanel />,
};

export function OpsView({ route, connection }: { route: Route; connection: Connection }) {
  const meta = ROUTE_META[route];
  // The eyebrow dot is a real health indicator (matching the topbar pill), not a
  // per-route decoration — a green dot must never appear while the gateway is down.
  const dot =
    connection === "online"
      ? "var(--accent-green)"
      : connection === "connecting"
        ? "var(--accent-orange)"
        : "var(--destructive)";
  return (
    <div className="ops">
      <div className="ops-inner">
        <div className="ops-head">
          <div className="eyebrow">
            <span className="cdot" style={{ background: dot }} />
            {meta.eyebrow}
          </div>
          <h2>{meta.title}</h2>
          <p>{meta.blurb}</p>
        </div>
        {PANELS[route]}
      </div>
    </div>
  );
}
