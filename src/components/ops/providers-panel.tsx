"use client";

import * as React from "react";
import { KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { ModelPicker } from "@/components/ui/model-picker";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PanelFrame, RefreshButton, SectionTitle } from "./shared";

export function ProvidersPanel() {
  const catalog = useAsync(() => api.providers(), []);
  const secrets = useAsync(() => api.secrets(), []);
  const info = useAsync(() => api.status(), []);
  const [provider, setProvider] = React.useState("");
  const [model, setModel] = React.useState("");
  const [key, setKey] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (secrets.data?.provider) setProvider(secrets.data.provider);
    // Mirror the server's value even when it is absent. A truthy guard here only
    // ever filled the field and never emptied it, so a base URL that the gateway
    // stopped returning — including one it now withholds because it held an API
    // key — stayed on screen until a page reload.
    setUrl(secrets.data?.api_url ?? "");
  }, [secrets.data?.provider, secrets.data?.api_url]);
  React.useEffect(() => {
    if (info.data?.model) setModel(info.data.model);
  }, [info.data?.model]);

  const active = secrets.data?.provider;
  const keyPresent = secrets.data?.api_key_present;

  const changeProvider = (next: string) => setProvider(next);

  const save = async () => {
    setBusy(true);
    try {
      const providerChanged = provider && provider !== active;
      const modelChanged = model && model !== info.data?.model;
      const res =
        providerChanged || modelChanged
          ? await api.setConfigModel({
              provider: providerChanged ? provider : undefined,
              model: model || undefined,
            })
          : null;
      if (key.trim() || url.trim()) {
        await api.setSecrets({ api_key: key.trim() || undefined, api_url: url.trim() || undefined });
      }
      // Surface the gateway's "no usable credential" heads-up — but not when the
      // user just added a key in this same save (which resolves it).
      if (res?.warning && !key.trim()) {
        toast.warning(res.warning);
      } else {
        toast.success(`Saved — ${provider || active} · ${model || "model unchanged"}`);
      }
      setKey("");
      secrets.refresh();
      info.refresh();
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        action={<RefreshButton onClick={() => { catalog.refresh(); secrets.refresh(); }} />}
      >
        Providers {catalog.data && <span className="text-muted-foreground">· {catalog.data.count}</span>}
      </SectionTitle>

      <Card className="space-y-3 p-4">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Active provider & key
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Currently:</span>
          <Badge variant="accent">{active || "none"}</Badge>
          <Badge variant={keyPresent ? "success" : "warning"}>{keyPresent ? "key set" : "no key"}</Badge>
          {secrets.data?.encrypt_at_rest && <span className="text-[10px]">· encrypted at rest</span>}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Combobox
            items={(catalog.data?.providers ?? []).map((p) => ({
              value: p.id,
              label: p.display_name,
              hint: p.local ? "local" : undefined,
            }))}
            value={provider}
            onChange={changeProvider}
            placeholder="Choose provider…"
            searchPlaceholder="Search provider…"
            emptyText="No providers"
          />
          <ModelPicker
            provider={provider}
            value={model}
            onChange={setModel}
            defaultModel={info.data?.model}
          />
        </div>
        {/* Labelled, not placeholder-only: these two fields sit next to each
            other, one takes a URL and one takes a credential, and a placeholder
            disappears the moment either is focused. Pasting a key into the base
            URL field put it in config.toml in plaintext. */}
        <div className="space-y-1">
          <label htmlFor="provider-api-url" className="text-xs text-muted-foreground">
            API base URL — optional, not your API key
          </label>
          <Input
            id="provider-api-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="provider-api-key" className="text-xs text-muted-foreground">
            API key for this provider
          </label>
          <Input
            id="provider-api-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type="password"
            placeholder="Leave blank to keep the current key"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={busy || !provider}>
            <KeyRound className="size-4" /> Save provider &amp; key
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Sets the active provider; key stored encrypted, never shown back.
          </span>
        </div>
      </Card>

      <PanelFrame loading={catalog.loading} error={catalog.error} onRefresh={catalog.refresh}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.data?.providers.map((p) => (
            <Card
              key={p.id}
              className={cn("flex items-center justify-between p-3", p.id === active && "border-accent/50")}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{p.display_name}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{p.id}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {p.id === active && <Badge variant="accent">active</Badge>}
                {p.local && <Badge variant="success">local</Badge>}
              </div>
            </Card>
          ))}
        </div>
      </PanelFrame>
    </div>
  );
}
