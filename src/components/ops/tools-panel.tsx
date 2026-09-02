"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import type { GatewayAutonomy } from "@/lib/types";
import { AUTONOMY, AUTONOMY_CHANGED, autonomyPreset, type AutonomyPreset } from "@/lib/console";
import {
  autoApproveEffective,
  capsChanges,
  capsSeed,
  commandBasename,
  hasWildcard,
  isHighRiskCommand,
  rungFromAutonomy,
  rungToAutonomyPayload,
  rungVerdict,
  toolOutcome,
  toolRows,
  type CapsDraft,
} from "@/lib/autonomy";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PanelFrame, RefreshButton, SectionTitle } from "./shared";

type AutonomyBody = Parameters<typeof api.setAutonomy>[0];
type FlagKey = "block_high_risk_commands" | "require_approval_for_medium_risk" | "workspace_only";

/** The three booleans `PUT /config/autonomy` accepts, as switches with a sentence each. */
const SAFETY_FLAGS: { key: FlagKey; label: string }[] = [
  { key: "block_high_risk_commands", label: "Block high-risk shell commands even when allowlisted" },
  { key: "require_approval_for_medium_risk", label: "Prompt for medium-risk shell commands" },
  { key: "workspace_only", label: "Confine file writes and command paths to the workspace" },
];

const list = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

/**
 * The page opens with the answer: what the agent may do without asking, right
 * now, under the enforced config. Not a card; the whitespace around the band
 * marks the focal point, as on Status, Channels and Providers. The dot wears
 * the ladder colour the rail and the option cards share.
 */
function RungBand({ a, preset }: { a: GatewayAutonomy; preset: AutonomyPreset }) {
  const v = rungVerdict(a);
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full"
          style={{ background: preset.dot }}
        />
        <p className="text-xl font-medium tracking-tight">{v.headline}</p>
      </div>
      <p className="mt-1.5 font-mono text-xs text-muted-foreground">
        {[preset.label, ...v.meta].join(" · ")}
      </p>
      {v.detail && <p className="mt-1.5 text-xs text-muted-foreground">{v.detail}</p>}
    </div>
  );
}

export function ToolsPanel() {
  const cfg = useAsync(() => api.config(), []);
  // The object a successful write returned, until the next config read lands:
  // every derived value (rung, rows, caps, chips) follows server truth at
  // once, with no flash back to the pre-write value while the refetch is in
  // flight.
  const [live, setLive] = React.useState<GatewayAutonomy | null>(null);
  React.useEffect(() => {
    setLive(null);
  }, [cfg.data]);
  const a: GatewayAutonomy = live ?? cfg.data?.autonomy ?? {};

  const stored = {
    actions: typeof a.max_actions_per_hour === "number" ? a.max_actions_per_hour : null,
    cents: typeof a.max_cost_per_day_cents === "number" ? a.max_cost_per_day_cents : null,
  };
  const autoApprove = list(a.auto_approve);
  // The gateway's list can already hold a duplicate (it stores the basename
  // of whatever was sent); show each command once.
  const allowed = Array.from(new Set(list(a.allowed_commands)));
  const forbidden = list(a.forbidden_paths);

  // The rung through the classifier the rail and Status also use, so the
  // three surfaces cannot disagree on one config.
  const rung = rungFromAutonomy(a);
  const preset = autonomyPreset(rung);

  // A rung written on the rail broadcasts; re-read so this panel follows it
  // (it used to keep the old rung until a manual Refresh).
  const refresh = cfg.refresh;
  React.useEffect(() => {
    window.addEventListener(AUTONOMY_CHANGED, refresh);
    return () => window.removeEventListener(AUTONOMY_CHANGED, refresh);
  }, [refresh]);

  // One key per control being written, so only that control is marked busy
  // while its request is in flight. Marked, not disabled: disabling the
  // focused button drops keyboard focus to the body mid-write.
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [cmd, setCmd] = React.useState("");
  const [caps, setCaps] = React.useState<CapsDraft>({ actions: "", cost: "" });
  const capsDirty = React.useRef(false);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  // Seed the cap fields from the config, but never over an edit in progress:
  // every other write refetches the config, and the refetch used to wipe a
  // half-typed cap back to the stored value.
  React.useEffect(() => {
    const stored = cfg.data?.autonomy;
    if (!stored || capsDirty.current) return;
    setCaps(
      capsSeed({
        actions: typeof stored.max_actions_per_hour === "number" ? stored.max_actions_per_hour : null,
        cents: typeof stored.max_cost_per_day_cents === "number" ? stored.max_cost_per_day_cents : null,
      }),
    );
  }, [cfg.data]);

  /**
   * PUT the change and return the stored autonomy object (server truth), or
   * null after a failure (already toasted). A rung write broadcasts instead of
   * refreshing directly: the listener above re-reads this panel too.
   */
  const patch = async (
    key: string,
    body: AutonomyBody,
    opts?: { broadcast?: boolean },
  ): Promise<GatewayAutonomy | null> => {
    if (busyKey === key) return null;
    setBusyKey(key);
    try {
      const stored = (await api.setAutonomy(body)) as GatewayAutonomy;
      setLive(stored);
      if (opts?.broadcast) window.dispatchEvent(new Event(AUTONOMY_CHANGED));
      else cfg.refresh();
      return stored;
    } catch (e) {
      toast.error(`Update failed: ${describeApiError(e)}`);
      return null;
    } finally {
      setBusyKey(null);
    }
  };

  const setRung = async (id: string, label: string) => {
    const r = await patch("rung", rungToAutonomyPayload(id, a), { broadcast: true });
    if (r) toast.success(`Autonomy set to ${label}`);
  };

  const toggleTool = async (tool: string) => {
    const next = autoApprove.includes(tool)
      ? autoApprove.filter((t) => t !== tool)
      : [...autoApprove, tool];
    const r = await patch(`tool:${tool}`, { auto_approve: next });
    // The word comes from what the gateway stored, not from the click.
    if (r) toast.success(`${tool}: ${toolOutcome(tool, r)}`);
  };

  const toggleFlag = async (key: FlagKey, label: string) => {
    const next = a[key] !== true;
    const r = await patch(`flag:${key}`, { [key]: next });
    if (r) toast.success(`${label}: ${next ? "on" : "off"}`);
  };

  const addCmd = async () => {
    const raw = cmd.trim();
    const base = commandBasename(raw);
    if (!base) return;
    if (allowed.includes(base)) {
      toast.message(`${base} is already allowed`);
      setCmd("");
      return;
    }
    const r = await patch("allow", { allowed_commands: [...allowed, base] });
    if (!r) return;
    setCmd("");
    const from = base === raw ? "" : ` (the basename of ${raw})`;
    if (isHighRiskCommand(base)) {
      toast.warning(
        `Allowed ${base}${from}. High-risk: the agent can run it without the risk prompt under Off or Full.`,
      );
    } else {
      toast.success(`Allowed ${base}${from}`);
    }
  };

  const removeCmd = async (c: string) => {
    const r = await patch(`chip:${c}`, { allowed_commands: allowed.filter((x) => x !== c) });
    if (r) toast.success(`Removed ${c} from the allowlist`);
  };

  const cc = capsChanges(caps, stored);
  const editCaps = (field: keyof CapsDraft, value: string) => {
    capsDirty.current = true;
    setCaps((d) => ({ ...d, [field]: value }));
  };
  const saveCaps = async () => {
    if (!cc.dirty) return;
    if (cc.error || !cc.write) {
      toast.error(cc.error ?? "Nothing to save");
      return;
    }
    const r = await patch("caps", cc.write);
    if (!r) return;
    capsDirty.current = false;
    bump();
    toast.success(
      `Caps saved: ${cc.write.max_actions_per_hour} actions per hour, $${(
        cc.write.max_cost_per_day_cents / 100
      ).toFixed(2)} per day (cost is reporting only)`,
    );
  };

  return (
    <div className="max-w-[1120px] space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PanelFrame
            loading={cfg.loading}
            loadingLabel="Loading policy…"
            error={cfg.error}
            loaded={cfg.loaded}
            onRefresh={cfg.refresh}
          >
            {cfg.data && <RungBand a={a} preset={preset} />}
          </PanelFrame>
        </div>
        <RefreshButton onClick={cfg.refresh} spinning={cfg.refreshing} />
      </div>

      {/* The 7/5 split: the decision and the per-tool rows get the width; the
          allowlist, caps, flags and paths scan in the narrow column. */}
      {cfg.data && (
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="space-y-8 lg:col-span-7">
            {/* Autonomy level: four option cards, each carrying its own
                consequence, so the decision reads as the page's subject. */}
            <div>
              <SectionTitle>Autonomy level</SectionTitle>
              <div role="group" aria-label="Autonomy level" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {AUTONOMY.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="rung"
                    aria-pressed={p.id === rung}
                    aria-busy={busyKey === "rung"}
                    aria-labelledby={`rung-${p.id}-label`}
                    aria-describedby={`rung-${p.id}-blurb`}
                    style={{ ["--rung" as string]: p.dot } as React.CSSProperties}
                    onClick={() => setRung(p.id, p.label)}
                  >
                    <span id={`rung-${p.id}-label`} className="head">
                      <i className="dot" aria-hidden />
                      {p.label}
                    </span>
                    <span id={`rung-${p.id}-blurb`} className="blurb">
                      {p.blurb}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-xs text-muted-foreground">
                Applies to the next tool call, in chat and on channels. Changing the rung also
                revokes every &ldquo;Always&rdquo; grant.
              </p>
            </div>

            {/* Per-tool auto-approve */}
            <div>
              <SectionTitle>Tool policy</SectionTitle>
              <p className="mb-2.5 text-xs text-muted-foreground">
                Under Smart a tool runs without the prompt when it is auto-approved; an always-ask
                entry, then the rung, come first.
              </p>
              <Card className="p-0">
                {hasWildcard(a) && (
                  <p className="border-b border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
                    Every tool prompts (Manual): the always-ask list is the wildcard.
                  </p>
                )}
                <ul className="px-4">
                  {toolRows(a).map((tool) => {
                    const auto = autoApprove.includes(tool);
                    // The word is the runtime's decision for this tool in this
                    // config (level, then always-ask, then auto-approve); the
                    // switch is disabled when it would not change that.
                    const outcome = toolOutcome(tool, a);
                    const effective = autoApproveEffective(tool, a);
                    return (
                      <li
                        key={tool}
                        className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0"
                      >
                        <span className="font-mono text-[13px]">{tool}</span>
                        <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
                          {outcome}
                        </span>
                        <button
                          type="button"
                          className={"switch" + (auto ? " on" : "")}
                          onClick={() => toggleTool(tool)}
                          aria-busy={busyKey === `tool:${tool}`}
                          disabled={!effective}
                          role="switch"
                          aria-checked={auto}
                          aria-label={`Auto-approve ${tool}`}
                          title={outcome}
                        >
                          <i />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </div>

          <div className="space-y-8 lg:col-span-5">
            {/* Shell allowlist */}
            <div>
              <SectionTitle>Shell allowlist · {allowed.length}</SectionTitle>
              <Card className="space-y-3 p-4">
                {allowed.length > 0 && (
                  <div className="allow-chips">
                    {allowed.map((c) => (
                      <Badge key={c} variant="secondary" className="allow-chip gap-1.5 font-mono">
                        {c}
                        <button
                          type="button"
                          onClick={() => removeCmd(c)}
                          aria-busy={busyKey === `chip:${c}`}
                          aria-label={`Remove ${c}`}
                          className="chip-x"
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={cmd}
                    onChange={(e) => setCmd(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addCmd();
                    }}
                    aria-label="Command to allow"
                    placeholder="add a command, e.g. docker"
                  />
                  <Button
                    size="sm"
                    className="h-9"
                    onClick={addCmd}
                    aria-busy={busyKey === "allow"}
                    disabled={!commandBasename(cmd)}
                  >
                    <Plus className="size-4" /> Add
                  </Button>
                </div>
              </Card>
            </div>

            {/* Rate & cost caps */}
            <div>
              <SectionTitle>Rate &amp; cost caps</SectionTitle>
              <Card className="space-y-3 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    actions / hour
                    <Input
                      type="number"
                      min="1"
                      value={caps.actions}
                      onChange={(e) => editCaps("actions", e.target.value)}
                      className="h-8"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    cost / day, reporting only
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={caps.cost}
                      onChange={(e) => editCaps("cost", e.target.value)}
                      className="h-8"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {/* aria-disabled, not disabled: a clean Save keeps focus after a save
                      lands (the button goes clean while it is the focused element). */}
                  <Button
                    size="sm"
                    onClick={saveCaps}
                    aria-disabled={!cc.dirty}
                    aria-busy={busyKey === "caps"}
                    className="aria-disabled:opacity-50"
                  >
                    Save caps
                  </Button>
                  <span className="text-xs text-muted-foreground" aria-live="polite">
                    {cc.dirty ? "Unsaved changes" : null}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  The actions cap stops a runaway loop. The cost cap is recorded for reporting and
                  is not enforced.
                </p>
              </Card>
            </div>

            {/* Safety flags */}
            <div>
              <SectionTitle>Safety flags</SectionTitle>
              <Card className="p-0">
                <ul className="px-4">
                  {SAFETY_FLAGS.map(({ key, label }) => {
                    const on = a[key] === true;
                    return (
                      <li
                        key={key}
                        className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 text-[13px]">{label}</span>
                        <button
                          type="button"
                          className={"switch" + (on ? " on" : "")}
                          onClick={() => toggleFlag(key, label)}
                          aria-busy={busyKey === `flag:${key}`}
                          role="switch"
                          aria-checked={on}
                          aria-label={label}
                        >
                          <i />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>

            {/* Forbidden paths */}
            {forbidden.length > 0 && (
              <div>
                <SectionTitle>
                  Forbidden paths · {forbidden.length} (read-only)
                </SectionTitle>
                <Card className="p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {forbidden.map((p) => (
                      <Badge key={p} variant="outline" className="font-mono text-muted-foreground">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
