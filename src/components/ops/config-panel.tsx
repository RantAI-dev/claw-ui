"use client";

import * as React from "react";
import { Eye, EyeOff, Save } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { maskConfigForDisplay, CONFIG_CHANGED } from "@/lib/console";
import type { GatewayConfig } from "@/lib/types";
import { useAsync } from "@/hooks/use-async";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PanelFrame, RefreshButton, SectionTitle } from "./shared";

export function ConfigPanel() {
  const cfg = useAsync(() => api.config(), []);
  const [temp, setTemp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);
  const tempErrId = React.useId();
  const tempHintId = React.useId();
  const rawId = React.useId();

  // Until the first successful GET /config, we have no temperature to edit
  // against. Writing then would save against a config we never read, so hold
  // Save disabled through the initial load and an initial-load failure.
  const notReady = cfg.loading || (!!cfg.error && !cfg.loaded);

  // Seed the field from the saved config, but only while it is clean: a
  // Refresh reloads the saved value, it does not overwrite work in progress
  // (the seededRef pattern persona-panel uses).
  const seededRef = React.useRef<GatewayConfig | null>(null);
  React.useEffect(() => {
    if (!cfg.data || cfg.data === seededRef.current) return;
    const prev = seededRef.current;
    seededRef.current = cfg.data;
    const prevSaved = prev?.default_temperature;
    const clean = temp.trim() === "" || prev == null || Number(temp) === prevSaved;
    if (clean)
      setTemp(cfg.data.default_temperature != null ? String(cfg.data.default_temperature) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  const savedTemp = cfg.data?.default_temperature ?? null;
  const parsed = temp.trim() === "" ? null : Number(temp);
  const rangeError =
    parsed != null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 2)
      ? "Temperature is 0.0 to 2.0."
      : null;
  // An empty field is not a "clear": the API has no unset, so it disables Save
  // and the hint names the runtime default instead. Only a valid number that
  // differs from the saved one arms Save — the toast can then only say
  // something true.
  const dirty = parsed != null && !rangeError && parsed !== savedTemp;

  const save = async () => {
    if (parsed == null || rangeError || !dirty) return;
    setBusy(true);
    try {
      await api.setConfigModel({ temperature: parsed });
      toast.success("Default temperature updated");
      cfg.refresh();
      // Invalidate the shell's load-time snapshots (right-rail temperature).
      window.dispatchEvent(new Event(CONFIG_CHANGED));
    } catch (e) {
      toast.error(`Save failed: ${describeApiError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle action={<RefreshButton onClick={cfg.refresh} />}>Config</SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Default sampling
        </div>
        {/* Guard the editable card: a failed initial GET /config shows a
            load/error state (with Retry) instead of an empty box that reads as
            "temperature unset" next to a live Save. `loaded` keeps the field on
            screen when only a post-save refresh fails. */}
        <PanelFrame
          loading={cfg.loading}
          error={cfg.error}
          loaded={cfg.loaded}
          onRefresh={cfg.refresh}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <Input
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              placeholder="temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              aria-invalid={rangeError ? true : undefined}
              aria-describedby={rangeError ? tempErrId : tempHintId}
              className="w-32"
            />
            <Button size="sm" type="submit" disabled={busy || notReady || !dirty}>
              <Save className="size-4" /> Save
            </Button>
          </form>
          {rangeError ? (
            <p id={tempErrId} role="alert" className="mt-2 text-[11px] text-destructive">
              {rangeError}
            </p>
          ) : (
            <p id={tempHintId} className="mt-2 text-[11px] text-muted-foreground">
              0.0 = deterministic, 2.0 = freewheeling. The runtime default is 0.7.
            </p>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Choose the active provider and model in{" "}
            <span className="text-foreground">Providers</span>.
          </p>
        </PanelFrame>
      </Card>

      {/* The disclosure exists only when there is something to disclose: during
          an initial-load error it would only duplicate the frame's error box,
          and on a refresh failure the card's strip is the one error surface
          while the loaded dump stays readable. */}
      {cfg.data != null && (
        <div>
          <button
            type="button"
            aria-expanded={showRaw}
            aria-controls={rawId}
            onClick={() => setShowRaw((v) => !v)}
            className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-10"
          >
            {showRaw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showRaw ? "Hide" : "Show"} full config (secrets masked)
          </button>
          {showRaw && (
            <div id={rawId}>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Values this console recognizes as secrets show as ••••••••; the gateway
                blanks the rest before sending, so an empty value can mean unset
                or hidden.
              </p>
              <pre className="mt-2 max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-[11px] scrollbar-thin">
                {JSON.stringify(maskConfigForDisplay(cfg.data), null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
