"use client";

import * as React from "react";
import { formatTemperature } from "@/lib/utils";
import { Eye, EyeOff, Save } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { maskConfigForDisplay, CONFIG_CHANGED } from "@/lib/console";
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

  // Until the first successful GET /config, we have no temperature to edit
  // against. Writing then would save against a config we never read, so hold
  // Save disabled through the initial load and an initial-load failure.
  const notReady = cfg.loading || (!!cfg.error && !cfg.loaded);

  React.useEffect(() => {
    if (cfg.data) {
      setTemp(
        cfg.data.default_temperature != null ? formatTemperature(cfg.data.default_temperature) : "",
      );
    }
  }, [cfg.data]);

  // Sampling temperature is 0–2 on every provider this console knows; the
  // gateway accepted -1 and 10 and the model call failed later.
  const tempNumber = Number(temp);
  const tempError =
    temp.trim() === ""
      ? "Enter a temperature between 0 and 2."
      : !Number.isFinite(tempNumber) || tempNumber < 0 || tempNumber > 2
        ? "Temperature must be between 0 and 2."
        : null;

  const save = async () => {
    if (tempError) return;
    setBusy(true);
    try {
      await api.setConfigModel({ temperature: tempNumber });
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
      <SectionTitle action={<RefreshButton onClick={cfg.refresh} spinning={cfg.refreshing} />}>Config</SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              placeholder="temperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              aria-label="Default temperature"
              aria-invalid={tempError ? true : undefined}
              className="w-32"
            />
            <Button size="sm" onClick={save} disabled={busy || notReady || tempError != null}>
              <Save className="size-4" /> Save
            </Button>
          </div>
          {tempError && (
            <p className="mt-2 text-[11px] text-destructive" role="alert">
              {tempError}
            </p>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Choose the active provider and model in{" "}
            <a href="#providers" className="text-foreground underline underline-offset-2">
              Providers
            </a>
            .
          </p>
        </PanelFrame>
      </Card>

      <div>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {showRaw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showRaw ? "Hide" : "Show"} full config (API keys and MCP env values masked)
        </button>
        {showRaw && (
          <PanelFrame loading={cfg.loading} error={cfg.error} loaded={cfg.loaded} onRefresh={cfg.refresh}>
            <pre className="mt-2 max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-[11px] scrollbar-thin">
              {JSON.stringify(maskConfigForDisplay(cfg.data), null, 2)}
            </pre>
          </PanelFrame>
        )}
      </div>
    </div>
  );
}
