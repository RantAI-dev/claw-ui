"use client";

import * as React from "react";
import { ROUTE_META, type Route } from "@/lib/console";
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

export function OpsView({ route }: { route: Route }) {
  const meta = ROUTE_META[route];
  return (
    <div className="ops">
      <div className="ops-inner">
        <div className="ops-head">
          <div className="eyebrow">
            <span className="cdot" style={{ background: meta.dot }} />
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
