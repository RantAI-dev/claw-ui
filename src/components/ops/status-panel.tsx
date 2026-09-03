"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AUTONOMY_CHANGED, autonomyPreset } from "@/lib/console";
import { rungFromAutonomy } from "@/lib/autonomy";
import {
  doctorSummary,
  emptyValue,
  formatUptime,
  pairingLabel,
  parseRuntimeHealth,
  skippedSentence,
  sortBySeverity,
} from "@/lib/status";
import type { GatewayConfig, StatusInfo } from "@/lib/types";
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
 * The page opens with the answer. One verdict line derived from the health
 * snapshot, the vitals as one quiet metadata line under it; per-component
 * rows appear only when there is more than one component or one of them is
 * unwell. Deliberately not a card: the whitespace around the band is what
 * marks it as the page's focal point.
 */
function HealthBand({ runtime }: { runtime: unknown }) {
  const health = parseRuntimeHealth(runtime);
  if (!health) {
    return (
      <div>
        <p className="text-xl font-medium tracking-tight">Gateway reachable</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          This gateway did not send a health snapshot.
        </p>
      </div>
    );
  }
  const bad = health.components.filter((c) => c.status.toLowerCase() !== "ok");
  const healthy = bad.length === 0;
  const at = health.updatedAt ? new Date(health.updatedAt) : null;
  const snapshotAt = at && !Number.isNaN(at.getTime()) ? at.toLocaleTimeString() : null;
  const single = health.components.length === 1 ? health.components[0] : null;
  const verdict = healthy
    ? "Runtime healthy"
    : bad.length === 1
      ? `${bad[0].name} ${bad[0].status}`
      : `${bad.length} components unwell`;
  const meta = [
    single ? `${single.name} ${single.status}` : null,
    health.uptimeSeconds != null ? `up ${formatUptime(health.uptimeSeconds)}` : null,
    single ? `${single.restartCount} ${single.restartCount === 1 ? "restart" : "restarts"}` : null,
    health.pid != null ? `pid ${health.pid}` : null,
    snapshotAt ? `snapshot ${snapshotAt}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full"
          style={{ background: healthy ? "var(--accent-green)" : "var(--destructive)" }}
        />
        <p className="text-xl font-medium tracking-tight">{verdict}</p>
      </div>
      {meta && <p className="mt-1.5 font-mono text-xs text-muted-foreground">{meta}</p>}
      {single?.lastError && (
        <p className="mt-1.5 text-xs text-destructive">last error: {single.lastError}</p>
      )}
      {!single && health.components.length > 0 && (
        <ul className="mt-3 space-y-1.5">
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
    </div>
  );
}

function autonomyLabel(cfg: { data: GatewayConfig | null; error: string | null }): string {
  // The rung the rest of the console speaks in, read from the same config and
  // the same classifier as the rail and the Tools panel. `/status` also
  // carries `autonomy_preset`, but the gateway calls any non-empty
  // `always_ask` Manual, and a fresh install ships `always_ask = ["ssh",
  // "pty"]` beside two auto-approved tools: it said "manual" for a policy
  // that never prompts for those two. Three surfaces on one classifier
  // cannot disagree; the gateway's own word is a backend follow-up.
  if (cfg.data?.autonomy) return autonomyPreset(rungFromAutonomy(cfg.data.autonomy)).label;
  return cfg.error ? "unknown" : "…";
}

/** Same cadence as the topbar pill (`useGatewayStatus`). */
const STATUS_POLL_MS = 15000;

export function StatusPanel() {
  const status = useAsync(() => api.status(), []);
  const cfg = useAsync(() => api.config(), []);
  const doctor = useAsync(() => api.doctor(), []);
  const insights = useAsync(() => api.insights(), []);
  const s = status.data;
  const skipped = skippedSentence(doctor.data?.skipped);

  // The health snapshot is the one thing on this page that changes on its
  // own, and the rail or the Tools panel can change the rung while the page
  // is open. Re-read `/status` and `/config` on the rung broadcast and on the
  // pill's cadence while the tab is visible; doctor and usage stay on their
  // buttons. `refresh` keeps the content mounted, so nothing flashes.
  const refreshStatusRaw = status.refresh;
  const refreshCfg = cfg.refresh;
  const refreshStatus = React.useCallback(() => {
    refreshStatusRaw();
    refreshCfg();
  }, [refreshStatusRaw, refreshCfg]);
  // The page button refreshes everything on the page (usage included); the
  // rung broadcast above stays narrow, and doctor stays on Re-run checks.
  const refreshInsights = insights.refresh;
  const refreshPage = React.useCallback(() => {
    refreshStatus();
    refreshInsights();
  }, [refreshStatus, refreshInsights]);
  React.useEffect(() => {
    window.addEventListener(AUTONOMY_CHANGED, refreshStatus);
    return () => window.removeEventListener(AUTONOMY_CHANGED, refreshStatus);
  }, [refreshStatus]);
  React.useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const start = () => {
      if (id === null && document.visibilityState !== "hidden") {
        id = setInterval(refreshStatus, STATUS_POLL_MS);
      }
    };
    // On becoming visible again, read once now rather than waiting out an
    // interval: the snapshot may be a whole hidden period stale.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }
      refreshStatus();
      start();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshStatus]);

  // The three requests fail for one cause when the gateway is down; one block
  // with one Retry, not three identical alarms under a pill that already
  // says "Gateway offline". A failure of the doctor or usage request alone
  // still shows inside its own section.
  if (status.error && !status.loaded) {
    return (
      <EmptyState
        tone="destructive"
        icon={<AlertTriangle className="size-6" />}
        title="Couldn't reach the gateway."
        hint={status.error}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              status.refresh();
              cfg.refresh();
              doctor.refresh();
              insights.refresh();
            }}
          >
            <RefreshCw /> Retry
          </Button>
        }
      />
    );
  }

  return (
    // The verdict band is the one focal point; the 7/5 grid under it gives
    // the actionable list the width while the facts scan in a narrow column
    // (a key/value row across the full page put 900px between key and value).
    // Capped width so the page composes instead of sprawling on wide screens.
    <div className="max-w-[1120px] space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PanelFrame
            loading={status.loading}
            error={status.error}
            loaded={status.loaded}
            loadingLabel="Loading health…"
          >
            {s && <HealthBand runtime={s.runtime} />}
          </PanelFrame>
        </div>
        <RefreshButton onClick={refreshPage} spinning={status.refreshing || cfg.refreshing || insights.refreshing} />
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <SectionTitle
            action={
              <RefreshButton
                label="Re-run checks"
                onClick={doctor.refresh}
                spinning={doctor.refreshing}
              />
            }
          >
            Doctor checks
          </SectionTitle>
          <PanelFrame
            loading={doctor.loading}
            error={doctor.error}
            loaded={doctor.loaded}
            loadingLabel="Running checks…"
          >
            {doctor.data && (
              <Card className="p-0">
                <p className="border-b border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
                  {doctorSummary(doctor.data.results)}
                  {skipped && (
                    <>
                      {" "}
                      {skipped} Run{" "}
                      <code className="font-mono text-foreground">rantaiclaw doctor</code> for the
                      full set.
                    </>
                  )}
                </p>
                <ul className="px-4">
                  {sortBySeverity(doctor.data.results).map((r) => (
                    <li
                      key={`${r.category}-${r.name}`}
                      className="flex items-start gap-3 border-b border-border/60 py-2.5 last:border-b-0"
                    >
                      {/* Fixed badge column so the check names line up. */}
                      <span className="w-14 shrink-0">
                        <SeverityBadge severity={r.severity} />
                      </span>
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
              </Card>
            )}
          </PanelFrame>
        </div>

        <div className="space-y-8 lg:col-span-5">
          {s && (
            <div>
              <SectionTitle>Runtime</SectionTitle>
              <Card className="p-4">
                <KeyVal k="Version" v={emptyValue(s.version, "unknown")} />
                <KeyVal k="Provider" v={emptyValue(s.provider)} />
                <KeyVal k="Model" v={emptyValue(s.model)} mono={!!s.model} />
                <KeyVal k="Autonomy" v={autonomyLabel(cfg)} />
                <KeyVal k="Pairing" v={pairingLabel(s.paired)} />
                <KeyVal k="Memory backend" v={emptyValue(s.memory_backend)} />
                <KeyVal k="Workspace" v={emptyValue(s.workspace_dir)} mono={!!s.workspace_dir} stack />
              </Card>
            </div>
          )}

          <div>
            <SectionTitle>Usage</SectionTitle>
            <PanelFrame
              loading={insights.loading}
              error={insights.error}
              loaded={insights.loaded}
              loadingLabel="Loading usage…"
            >
              {insights.data &&
                (insights.data.total_sessions > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    <StatTile label="Sessions" value={formatNumber(insights.data.total_sessions)} />
                    <StatTile label="Messages" value={formatNumber(insights.data.total_messages)} />
                    <StatTile
                      label="Avg / session"
                      value={insights.data.avg_messages_per_session.toFixed(1)}
                    />
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
        </div>
      </div>
    </div>
  );
}
