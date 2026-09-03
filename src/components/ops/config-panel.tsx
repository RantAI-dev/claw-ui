"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import {
  maskConfigForDisplay,
  configVerdict,
  CONFIG_CHANGED,
  type ConfigVerdict,
} from "@/lib/console";
import type { GatewayConfig } from "@/lib/types";
import { useAsync } from "@/hooks/use-async";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PanelFrame, RefreshButton, SectionTitle } from "./shared";

/**
 * The page opens with the answer: what is the runtime tuned to right now? One
 * verdict line for the sampling temperature (the page's one tunable), the
 * provider/model/MCP context as one quiet metadata line under it. Not a card;
 * the whitespace around the band marks the focal point, as on Status,
 * Channels, Providers, Schedules, Skills, Knowledge Bases, Memory and
 * Persona. The band always reads the SAVED config — edits below move it only
 * through Save. The dot goes warning when the value on disk is one providers
 * would reject (possible via older gateways or a hand-edited config.toml).
 */
function ConfigBand({ verdict }: { verdict: ConfigVerdict }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full"
          style={{
            background: verdict.tone === "ok" ? "var(--accent-green)" : "var(--accent-orange)",
          }}
        />
        <p className="text-xl font-medium tracking-tight">{verdict.headline}</p>
      </div>
      {verdict.meta.length > 0 && (
        <p className="mt-1.5 font-mono text-xs text-muted-foreground">
          {verdict.meta.map((m, i) => (
            <React.Fragment key={m}>
              {i > 0 && <span aria-hidden> · </span>}
              <span>{m}</span>
            </React.Fragment>
          ))}
        </p>
      )}
      {verdict.detail && <p className="mt-1.5 text-xs text-muted-foreground">{verdict.detail}</p>}
    </div>
  );
}

export function ConfigPanel() {
  const cfg = useAsync(() => api.config(), []);
  const [temp, setTemp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const tempId = React.useId();
  const tempErrId = React.useId();
  const tempHintId = React.useId();

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
    <div className="max-w-[1120px] space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {cfg.data && <ConfigBand verdict={configVerdict(cfg.data)} />}
        </div>
        <RefreshButton onClick={cfg.refresh} spinning={cfg.refreshing} />
      </div>

      <PanelFrame
        loading={cfg.loading}
        loadingLabel="Loading config…"
        error={cfg.error}
        loaded={cfg.loaded}
        onRefresh={cfg.refresh}
      >
        {cfg.data && (
          /* The 7/5 split gives the running config — the page's reference bulk —
             a readable measure; the one tunable composes in the narrow column.
             On one column the form comes first: the knob before the dump. */
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="min-w-0 lg:order-2 lg:col-span-5">
              <SectionTitle>Default sampling</SectionTitle>
              <p className="text-xs text-muted-foreground">
                The runtime falls back to this temperature when a request does not set its own.
              </p>
              <Card className="mt-3 space-y-3 p-4">
                <div className="space-y-1.5">
                  <label htmlFor={tempId} className="eyebrow block">
                    Temperature
                  </label>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void save();
                    }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Input
                      id={tempId}
                      value={temp}
                      onChange={(e) => setTemp(e.target.value)}
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      aria-invalid={rangeError ? true : undefined}
                      aria-describedby={rangeError ? tempErrId : tempHintId}
                      className="w-28"
                    />
                    <Button size="sm" type="submit" disabled={busy || notReady || !dirty}>
                      <Save className="size-4" /> Save
                    </Button>
                  </form>
                  {rangeError ? (
                    <p id={tempErrId} role="alert" className="text-[11px] text-destructive">
                      {rangeError}
                    </p>
                  ) : (
                    <p id={tempHintId} className="text-[11px] text-muted-foreground">
                      0.0 = deterministic, 2.0 = freewheeling. The runtime default is 0.7.
                    </p>
                  )}
                </div>
                <p className="border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                  Choose the active provider and model in{" "}
                  <a
                    href="#providers"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Providers
                  </a>
                  .
                </p>
              </Card>
            </div>

            <div className="min-w-0 lg:order-1 lg:col-span-7">
              <SectionTitle>Running config</SectionTitle>
              <p className="text-xs text-muted-foreground">
                The gateway&apos;s live view of config.toml. Values this console recognizes as
                secrets show as ••••••••; the gateway blanks the rest before sending, so an
                empty value can mean unset or hidden.
              </p>
              <pre className="mt-3 max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-[11px] leading-relaxed scrollbar-thin">
                {JSON.stringify(maskConfigForDisplay(cfg.data), null, 2)}
              </pre>
            </div>
          </div>
        )}
      </PanelFrame>
    </div>
  );
}
