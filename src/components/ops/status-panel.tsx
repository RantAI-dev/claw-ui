"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { Card } from "@/components/ui/card";
import { autonomyPreset, levelToRung } from "@/lib/console";
import { formatNumber, relativeTime } from "@/lib/utils";
import { KeyVal, PanelFrame, RefreshButton, SectionTitle, SeverityBadge, StatTile } from "./shared";

export function StatusPanel() {
  const status = useAsync(() => api.status(), []);
  const doctor = useAsync(() => api.doctor(), []);
  const insights = useAsync(() => api.insights(), []);
  const s = status.data;
  // Show the preset the rest of the console speaks in, not the raw enforcement
  // level. `autonomy_preset` is what distinguishes Manual from Smart — both are
  // `Supervised`. On an older gateway that omits it, fall back through
  // `levelToRung`, which is the mapping that understands every spelling the
  // gateway sends (`ReadOnly` from /status, `readonly` from /config); it can
  // only ever report Smart for a supervised level, which is the most that
  // payload supports.
  const autonomyLabel = s
    ? autonomyPreset(s.autonomy_preset ?? levelToRung(s.autonomy)).label
    : "unknown";

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle action={<RefreshButton onClick={() => { status.refresh(); doctor.refresh(); }} spinning={status.refreshing || doctor.refreshing} />}>
          Runtime
        </SectionTitle>
        <PanelFrame loading={status.loading} error={status.error} loaded={status.loaded} onRefresh={status.refresh}>
          {s && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Version" value={s.version} />
                <StatTile label="Provider" value={s.provider || "not set"} tone="accent" />
                <StatTile label="Paired" value={s.paired ? "Yes" : "No"} tone={s.paired ? "success" : "warning"} />
                <StatTile label="Autonomy" value={autonomyLabel} />
              </div>
              <Card className="mt-3 p-4">
                <KeyVal k="Model" v={s.model || "not set"} mono />
                <KeyVal k="Memory backend" v={s.memory_backend || "none"} />
                <KeyVal k="Workspace" v={s.workspace_dir || "not set"} mono />
              </Card>
            </>
          )}
        </PanelFrame>
      </div>

      <div>
        <SectionTitle action={<RefreshButton onClick={() => insights.refresh()} spinning={insights.refreshing} />}>Usage</SectionTitle>
        <PanelFrame
          loading={insights.loading}
          error={insights.error}
          loaded={insights.loaded}
          onRefresh={insights.refresh}
        >
          {insights.data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Sessions" value={formatNumber(insights.data.total_sessions)} />
              <StatTile label="Messages" value={formatNumber(insights.data.total_messages)} />
              <StatTile label="Avg / session" value={insights.data.avg_messages_per_session.toFixed(1)} />
              <StatTile
                label="Latest"
                value={insights.data.latest_session_started_at ? relativeTime(insights.data.latest_session_started_at) : "no sessions yet"}
              />
            </div>
          )}
        </PanelFrame>
      </div>

      <div>
        <SectionTitle>Doctor checks</SectionTitle>
        <PanelFrame
          loading={doctor.loading}
          error={doctor.error}
          loaded={doctor.loaded}
          empty={doctor.data?.results.length === 0}
          emptyTitle="No doctor checks reported."
          emptyHint="The gateway returned an empty check list. Refresh to run them again."
          onRefresh={doctor.refresh}
        >
          <div className="space-y-1.5">
            {doctor.data?.results.map((r) => (
              <Card key={`${r.category}-${r.name}`} className="flex items-start gap-3 p-3">
                <SeverityBadge severity={r.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.name}</span>
                    <span className="text-[10px] text-muted-foreground">{r.category}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.message}</p>
                  {r.hint && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {/* Doctor hints are mostly "run: <command>"; the command is
                          what the operator copies, so it gets the mono treatment
                          and the accent stops posing as a link. */}
                      {/^run:\s*/i.test(r.hint) ? (
                        <>
                          Run <code className="font-mono text-foreground">{r.hint.replace(/^run:\s*/i, "")}</code>
                        </>
                      ) : (
                        r.hint
                      )}
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </PanelFrame>
      </div>
    </div>
  );
}
