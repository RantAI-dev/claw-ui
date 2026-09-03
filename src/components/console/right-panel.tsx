"use client";

import * as React from "react";
import { PanelRight, PanelRightClose } from "lucide-react";
import { autonomyPreset, channelDot } from "@/lib/console";
import { formatNumber, formatUsd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface RightPanelData {
  model: string;
  provider: string;
  temperature: string;
  autonomy: string;
  version: string;
  paired: boolean;
  channels: string[];
  skills: string[];
  sessionId: string | null;
  totals: { turns: number; tokens: number; cost: number; toolCalls: number };
}

export const RightPanel = React.memo(function RightPanel({ data, onCollapse }: { data: RightPanelData; onCollapse?: () => void }) {
  const auto = autonomyPreset(data.autonomy);
  const t = data.totals;

  return (
    <aside className="right">
      <div className="right-head">
        <PanelRight className="size-[15px] text-muted-foreground" />
        <div className="eyebrow">Session Context</div>
        {onCollapse && (
          <button className="icon-btn ml-auto" onClick={onCollapse} title="Collapse panel">
            <PanelRightClose />
          </button>
        )}
      </div>
      <div className="right-scroll">
        <div>
          <div className="rsec-title">
            <span className="cdot" style={{ background: "var(--brand-sky)" }} />
            <b>Runtime</b>
          </div>
          <div className="kv">
            <div className="kv-row">
              <span className="k">model</span>
              <span className="v">{data.model ? data.model.split("/").pop() : "not set"}</span>
            </div>
            <div className="kv-row">
              <span className="k">provider</span>
              <span className="v">{data.provider || "not set"}</span>
            </div>
            <div className="kv-row">
              <span className="k">temperature</span>
              <span className="v">{data.temperature || "default"}</span>
            </div>
            <div className="kv-row">
              <span className="k">autonomy</span>
              {/* Dot carries the rung colour; the label stays foreground (purple text here was 2.5:1). */}
              <span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <i style={{ width: 7, height: 7, borderRadius: 999, background: auto.dot }} />
                {auto.label}
              </span>
            </div>
            <div className="kv-row">
              <span className="k">version</span>
              <span className="v">{data.version ? `v${data.version}` : "unknown"}</span>
            </div>
            <div className="kv-row">
              <span className="k">paired</span>
              <span className="v" style={{ color: data.paired ? "var(--accent-green)" : "var(--accent-orange)" }}>
                {data.paired ? "yes" : "no"}
              </span>
            </div>
          </div>
        </div>

        <div>
          <div className="rsec-title">
            <span className="cdot" style={{ background: "var(--accent-green)" }} />
            {/* `GET /channels` reports what is configured, not what is running
                (the Channels panel joins runtime health for that), so this
                block must not claim "online". */}
            <b>Channels configured</b>
            <span className="more">{data.channels.length}</span>
          </div>
          {data.channels.length > 0 ? (
            <div className="minis">
              {data.channels.map((c) => (
                <div className="mini" key={c}>
                  <span className="chan-dot" style={{ background: channelDot(c) }} />
                  <span className="m-name">{c}</span>
                  <span className="m-proto">set up</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="auto-blurb min-h-0">No channels configured.</div>
          )}
        </div>

        <div>
          <div className="rsec-title">
            <span className="cdot" style={{ background: "var(--accent-orange)" }} />
            <b>This session</b>
            {data.sessionId && <span className="more">{data.sessionId.slice(0, 8)}</span>}
          </div>
          {/* The four numbers an operator glances at mid-conversation: designed
              as data, not as a debug key/value dump. */}
          <div className="stat-mini-grid">
            <div className="stat-mini">
              <b>{formatNumber(t.turns)}</b>
              <span>turns</span>
            </div>
            <div className="stat-mini">
              <b className="sky">{formatNumber(t.tokens)}</b>
              <span>tokens</span>
            </div>
            <div className="stat-mini">
              <b>{formatUsd(t.cost)}</b>
              <span>cost</span>
            </div>
            <div className="stat-mini">
              <b>{formatNumber(t.toolCalls)}</b>
              <span>tool calls</span>
            </div>
          </div>
        </div>

        <div>
          <div className="rsec-title">
            <span className="cdot" style={{ background: "var(--accent-purple)" }} />
            <b>Active skills</b>
            <span className="more">{data.skills.length}</span>
          </div>
          {data.skills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.skills.map((s) => (
                <Badge key={s} variant="outline" className="font-mono text-[11px]">
                  {s}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="auto-blurb min-h-0">No active skills.</div>
          )}
        </div>
      </div>
    </aside>
  );
});
