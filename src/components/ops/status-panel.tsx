"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { Card } from "@/components/ui/card";
import { autonomyPreset, levelToRung } from "@/lib/console";
import {
  doctorSummary,
  emptyValue,
  formatUptime,
  pairingLabel,
  parseRuntimeHealth,
  skippedSentence,
  sortBySeverity,
} from "@/lib/status";
import type { StatusInfo } from "@/lib/types";
import { formatNumber, relativeTime } from "@/lib/utils";
import {
  EmptyState,
  KeyVal,
  PanelFrame,
  RefreshButton,
  SectionTitle,
  SeverityBadge,
  StatTile,
} from "./shared";

/**
 * The daemon's own health: one row per runtime component, then when the
 * snapshot was taken. This is what the "Runtime health" eyebrow promises; the
 * configuration facts below it are context, not health.
 */
function HealthCard({ runtime }: { runtime: unknown }) {
  const health = parseRuntimeHealth(runtime);
  if (!health) {
    return (
      <p className="text-xs text-muted-foreground">This gateway did not send a health snapshot.</p>
    );
  }
  const at = health.updatedAt ? new Date(health.updatedAt) : null;
  const snapshotAt = at && !Number.isNaN(at.getTime()) ? at.toLocaleTimeString() : null;
  const footer = [
    health.uptimeSeconds != null ? `Up ${formatUptime(health.uptimeSeconds)}` : null,
    snapshotAt ? `snapshot ${snapshotAt}` : null,
    health.pid != null ? `pid ${health.pid}` : null,
  ].filter(Boolean);
  return (
    <Card className="p-4">
      {health.components.length === 0 ? (
        <p className="text-xs text-muted-foreground">No components reported yet.</p>
      ) : (
        <ul className="space-y-2">
          {health.components.map((c) => {
            const ok = c.status.toLowerCase() === "ok";
            return (
              <li key={c.name} className="text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    aria-hidden
                    className="inline-block size-2 rounded-full"
                    style={{ background: ok ? "var(--accent-green)" : "var(--destructive)" }}
                  />
                  <span className="font-medium">{c.name}</span>
                  <span className={ok ? "text-muted-foreground" : "text-destructive"}>{c.status}</span>
                  <span className="text-muted-foreground">
                    {c.restartCount} {c.restartCount === 1 ? "restart" : "restarts"}
                  </span>
                </div>
                {c.lastError && (
                  <p className="mt-1 text-xs text-destructive">last error: {c.lastError}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {footer.length > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">{footer.join(" · ")}</p>
      )}
    </Card>
  );
}

function autonomyLabel(s: StatusInfo): string {
  // Show the preset the rest of the console speaks in, not the raw enforcement
  // level: `autonomy_preset` is what tells Manual from Smart (both are
  // `Supervised`). An older gateway omits it; `levelToRung` then reads the level,
  // which can only ever say Smart for a supervised gateway. Neither field means
  // the payload cannot say, so say that.
  if (!s.autonomy_preset && !s.autonomy) return "unknown";
  return autonomyPreset(s.autonomy_preset ?? levelToRung(s.autonomy)).label;
}

export function StatusPanel() {
  const status = useAsync(() => api.status(), []);
  const doctor = useAsync(() => api.doctor(), []);
  const insights = useAsync(() => api.insights(), []);
  const s = status.data;
  const skipped = skippedSentence(doctor.data?.skipped);

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle action={<RefreshButton onClick={status.refresh} />}>Health</SectionTitle>
        <PanelFrame loading={status.loading} error={status.error} loaded={status.loaded} onRefresh={status.refresh}>
          {s && (
            <>
              <HealthCard runtime={s.runtime} />
              <div className="mt-6">
                <SectionTitle>Runtime</SectionTitle>
              </div>
              <Card className="p-4">
                <KeyVal k="Version" v={emptyValue(s.version, "unknown")} />
                <KeyVal k="Provider" v={emptyValue(s.provider)} />
                <KeyVal k="Model" v={emptyValue(s.model)} mono={!!s.model} />
                <KeyVal k="Autonomy" v={autonomyLabel(s)} />
                <KeyVal k="Pairing" v={pairingLabel(s.paired)} />
                <KeyVal k="Memory backend" v={emptyValue(s.memory_backend)} />
                <KeyVal k="Workspace" v={emptyValue(s.workspace_dir)} mono={!!s.workspace_dir} />
              </Card>
            </>
          )}
        </PanelFrame>
      </div>

      <div>
        <SectionTitle action={<RefreshButton onClick={insights.refresh} />}>Usage</SectionTitle>
        <PanelFrame
          loading={insights.loading}
          error={insights.error}
          loaded={insights.loaded}
          onRefresh={insights.refresh}
        >
          {insights.data &&
            (insights.data.total_sessions > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Sessions" value={formatNumber(insights.data.total_sessions)} />
                <StatTile label="Messages" value={formatNumber(insights.data.total_messages)} />
                <StatTile label="Avg / session" value={insights.data.avg_messages_per_session.toFixed(1)} />
                <StatTile
                  label="Latest"
                  value={
                    insights.data.latest_session_started_at
                      ? relativeTime(insights.data.latest_session_started_at)
                      : "none yet"
                  }
                />
              </div>
            ) : (
              <EmptyState
                className="py-8"
                title="No sessions yet."
                hint="Send a message in Chat to start one."
              />
            ))}
        </PanelFrame>
      </div>

      <div>
        <SectionTitle action={<RefreshButton label="Re-run checks" onClick={doctor.refresh} />}>
          Doctor checks
        </SectionTitle>
        <PanelFrame loading={doctor.loading} error={doctor.error} loaded={doctor.loaded} onRefresh={doctor.refresh}>
          {doctor.data && (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                {doctorSummary(doctor.data.results)}
                {skipped && (
                  <>
                    {" "}
                    {skipped} Run <code className="font-mono text-foreground">rantaiclaw doctor</code> for
                    the full set.
                  </>
                )}
              </p>
              <ul>
                {sortBySeverity(doctor.data.results).map((r) => (
                  <li
                    key={`${r.category}-${r.name}`}
                    className="flex items-start gap-3 border-b border-border/60 py-2.5 last:border-b-0"
                  >
                    <SeverityBadge severity={r.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{r.name}</span>
                        <span className="text-[11px] text-muted-foreground">{r.category}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{r.message}</p>
                      {r.hint && <p className="mt-0.5 text-[11px] text-accent">{r.hint}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </PanelFrame>
      </div>
    </div>
  );
}
