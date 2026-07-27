"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { Card } from "@/components/ui/card";
import { autonomyPreset, levelToRung } from "@/lib/console";
import { KeyVal, PanelFrame, RefreshButton, SectionTitle, SeverityBadge, StatTile } from "./shared";

export function StatusPanel() {
  const status = useAsync(() => api.status(), []);
  const doctor = useAsync(() => api.doctor(), []);
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
    : "—";

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle action={<RefreshButton onClick={() => { status.refresh(); doctor.refresh(); }} />}>
          Runtime
        </SectionTitle>
        <PanelFrame loading={status.loading} error={status.error} onRefresh={status.refresh}>
          {s && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Version" value={s.version} />
                <StatTile label="Provider" value={s.provider || "—"} tone="accent" />
                <StatTile label="Paired" value={s.paired ? "Yes" : "No"} tone={s.paired ? "success" : "warning"} />
                <StatTile label="Autonomy" value={autonomyLabel} />
              </div>
              <Card className="mt-3 p-4">
                <KeyVal k="Model" v={s.model || "—"} mono />
                <KeyVal k="Memory backend" v={s.memory_backend || "—"} />
                <KeyVal k="Workspace" v={s.workspace_dir || "—"} mono />
              </Card>
            </>
          )}
        </PanelFrame>
      </div>

      <div>
        <SectionTitle>Doctor checks</SectionTitle>
        <PanelFrame
          loading={doctor.loading}
          error={doctor.error}
          empty={doctor.data?.results.length === 0}
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
                  {r.hint && <p className="mt-0.5 text-[11px] text-accent">{r.hint}</p>}
                </div>
              </Card>
            ))}
          </div>
        </PanelFrame>
      </div>
    </div>
  );
}
