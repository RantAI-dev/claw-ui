"use client";

import * as React from "react";
import { PanelRight, PanelRightClose } from "lucide-react";
import { autonomyPreset, channelDot } from "@/lib/console";
import { formatNumber, formatUsd } from "@/lib/utils";

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

export function RightPanel({ data, onCollapse }: { data: RightPanelData; onCollapse?: () => void }) {
  const auto = autonomyPreset(data.autonomy);
  const t = data.totals;

  return (
    <aside className="right">
      <div className="right-head">
        <PanelRight style={{ width: 15, height: 15, color: "var(--muted-foreground)" }} />
        <div className="eyebrow">Session Context</div>
        {onCollapse && (
          <button
            className="icon-btn"
            onClick={onCollapse}
            title="Collapse panel"
            style={{ marginLeft: "auto" }}
          >
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
              <span className="v">{data.model ? data.model.split("/").pop() : "—"}</span>
            </div>
            <div className="kv-row">
              <span className="k">provider</span>
              <span className="v">{data.provider || "—"}</span>
            </div>
            <div className="kv-row">
              <span className="k">temperature</span>
              <span className="v">{data.temperature || "—"}</span>
            </div>
            <div className="kv-row">
              <span className="k">autonomy</span>
              <span className="v" style={{ color: auto.dot }}>
                {auto.label}
              </span>
            </div>
            <div className="kv-row">
              <span className="k">version</span>
              <span className="v">{data.version ? `v${data.version}` : "—"}</span>
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
            <b>Channels online</b>
            <span className="more">{data.channels.length}</span>
          </div>
          {data.channels.length > 0 ? (
            <div className="minis">
              {data.channels.map((c) => (
                <div className="mini" key={c}>
                  <span className="chan-dot" style={{ background: channelDot(c) }} />
                  <span className="m-name">{c}</span>
                  <span className="m-proto">on</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="auto-blurb" style={{ minHeight: 0 }}>
              No channels configured.
            </div>
          )}
        </div>

        <div>
          <div className="rsec-title">
            <span className="cdot" style={{ background: "var(--accent-orange)" }} />
            <b>This session</b>
            {data.sessionId && <span className="more">{data.sessionId.slice(0, 8)}</span>}
          </div>
          <div className="kv">
            <div className="kv-row">
              <span className="k">turns</span>
              <span className="v">{formatNumber(t.turns)}</span>
            </div>
            <div className="kv-row">
              <span className="k">tokens</span>
              <span className="v sky">{formatNumber(t.tokens)}</span>
            </div>
            <div className="kv-row">
              <span className="k">cost</span>
              <span className="v">{formatUsd(t.cost)}</span>
            </div>
            <div className="kv-row">
              <span className="k">tool calls</span>
              <span className="v">{formatNumber(t.toolCalls)}</span>
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
            <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {data.skills.map((s) => (
                <span
                  key={s}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--foreground)",
                    padding: "5px 10px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border)",
                    background: "oklch(1 0 0 / 2.5%)",
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <div className="auto-blurb" style={{ minHeight: 0 }}>
              No skills installed.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
