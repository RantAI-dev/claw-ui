"use client";

import * as React from "react";
import { Eye, EyeOff, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PanelFrame, RefreshButton, SectionTitle } from "./shared";

export function ConfigPanel() {
  const cfg = useAsync(() => api.config(), []);
  const [provider, setProvider] = React.useState("");
  const [model, setModel] = React.useState("");
  const [temp, setTemp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);

  React.useEffect(() => {
    if (cfg.data) {
      setProvider((cfg.data.default_provider as string) || "");
      setModel((cfg.data.default_model as string) || "");
      setTemp(cfg.data.default_temperature != null ? String(cfg.data.default_temperature) : "");
    }
  }, [cfg.data]);

  const save = async () => {
    setBusy(true);
    try {
      await api.setConfigModel({
        provider: provider || undefined,
        model: model || undefined,
        temperature: temp ? Number(temp) : undefined,
      });
      toast.success("Config updated");
      cfg.refresh();
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle action={<RefreshButton onClick={cfg.refresh} />}>Config</SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Default model
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="provider"
          />
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model"
            className="font-mono text-xs"
          />
          <Input
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            placeholder="temperature"
            type="number"
            step="0.1"
          />
        </div>
        <Button size="sm" onClick={save} disabled={busy}>
          <Save className="size-4" /> Save model
        </Button>
      </Card>

      <div>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {showRaw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showRaw ? "Hide" : "Show"} full config (secrets redacted)
        </button>
        {showRaw && (
          <PanelFrame loading={cfg.loading} error={cfg.error} onRefresh={cfg.refresh}>
            <pre className="mt-2 max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-[11px] scrollbar-thin">
              {JSON.stringify(cfg.data, null, 2)}
            </pre>
          </PanelFrame>
        )}
      </div>
    </div>
  );
}
