"use client";

import * as React from "react";
import { KeyRound, Trash2, RotateCcw } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { ModelPicker } from "@/components/ui/model-picker";
import type { ModelCatalog } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { PanelFrame, RefreshButton, SectionTitle } from "./shared";

export function ProvidersPanel() {
  const catalog = useAsync(() => api.providers(), []);
  const secrets = useAsync(() => api.secrets(), []);
  const info = useAsync(() => api.status(), []);
  const [provider, setProvider] = React.useState("");
  const [model, setModel] = React.useState("");
  // The picker's catalog for the provider in the box, so a provider switch with
  // no explicit model can save that provider's default instead of nothing.
  const [modelCatalog, setModelCatalog] = React.useState<ModelCatalog | null>(null);
  const [key, setKey] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // Explicit clear flow (distinct from blank-Save, which means "keep"): these
  // send an empty string, the gateway's clear-on-empty signal.
  const [pendingClear, setPendingClear] = React.useState<null | "key" | "url">(null);
  const [clearing, setClearing] = React.useState(false);

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

  // A model id belongs to its provider: carrying "gpt-5-mini" over to Ollama
  // wrote a cross-provider pair into config. Clear it on a switch; the picker
  // shows the new provider's default until one is chosen.
  const changeProvider = (next: string) => {
    if (next !== provider) setModel("");
    setProvider(next);
  };
  const isLocal = !!catalog.data?.providers.find((p) => p.id === (provider || active))?.local;

  // Deliberately send "" to CLEAR one secret field, leaving the other untouched
  // (the gateway sets a provided field, leaves an omitted one). This is the only
  // way to revoke a key/URL from the console; a blank normal Save keeps it.
  const clearSecret = async () => {
    const which = pendingClear;
    if (!which) return;
    setClearing(true);
    try {
      await api.setSecrets(which === "key" ? { api_key: "" } : { api_url: "" });
      toast.success(which === "key" ? "API key removed" : "Base URL reset");
      if (which === "key") setKey("");
      else setUrl("");
      setPendingClear(null);
    } catch (e) {
      toast.error(`Clear failed: ${describeApiError(e)}`);
    } finally {
      // Re-read server truth so the badge/field reflect what actually persisted.
      secrets.refresh();
      info.refresh();
      setClearing(false);
    }
  };

  const save = async () => {
    setBusy(true);
    // Provider save is two non-atomic writes (model then secrets). Track whether
    // the first landed so a failure on the second can say the state is split
    // rather than unchanged.
    let modelSwitched = false;
    try {
      const providerChanged = provider && provider !== active;
      // On a provider switch with no pick, save that provider's default so the
      // old provider's model id never lands in config.
      const resolvedModel = model || (providerChanged ? modelCatalog?.default || "" : "");
      const modelChanged = resolvedModel && resolvedModel !== info.data?.model;
      const res =
        providerChanged || modelChanged
          ? await api.setConfigModel({
              provider: providerChanged ? provider : undefined,
              model: resolvedModel || undefined,
            })
          : null;
      modelSwitched = Boolean(providerChanged || modelChanged);
      if (key.trim() || url.trim()) {
        await api.setSecrets({ api_key: key.trim() || undefined, api_url: url.trim() || undefined });
      }
      // Surface the gateway's "no usable credential" heads-up — but not when the
      // user just added a key in this same save (which resolves it).
      toast.success(`Saved: ${provider || active} · ${resolvedModel || "model unchanged"}`);
      // The gateway's "no usable credential" heads-up: not when a key was just
      // added in this save, and not for a local provider that needs none.
      if (res?.warning && !key.trim() && !isLocal) toast.warning(res.warning);
      setKey("");
    } catch (e) {
      const detail = describeApiError(e);
      toast.error(
        modelSwitched
          ? `Provider/model switched, but saving the key/URL failed: ${detail}`
          : `Save failed: ${detail}`,
      );
    } finally {
      // Always re-read server truth — even on a partial failure — so the panel
      // reflects what actually persisted, not the stale pre-save view.
      secrets.refresh();
      info.refresh();
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        action={
          <RefreshButton
            onClick={() => { catalog.refresh(); secrets.refresh(); }}
            spinning={catalog.refreshing || secrets.refreshing}
          />
        }
      >
        Providers {catalog.data && <span className="text-muted-foreground">· {catalog.data.count}</span>}
      </SectionTitle>

      <Card className="space-y-3 p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Active provider & key
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Currently:</span>
          <Badge variant="accent">{active || "none"}</Badge>
          <Badge variant={keyPresent ? "success" : "warning"}>{keyPresent ? "key set" : "no key"}</Badge>
          {keyPresent && secrets.data?.encrypt_at_rest && (
            <span className="text-[11px]">· encrypted at rest</span>
          )}
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
            emptyText="No provider matches that search."
          />
          <ModelPicker
            provider={provider}
            value={model}
            onChange={setModel}
            // The placeholder is what Save will use: the running model while the
            // active provider is in the box, that provider's catalog default after
            // a switch (not the old provider's model id).
            defaultModel={provider === active ? info.data?.model : modelCatalog?.default}
            onCatalog={setModelCatalog}
          />
        </div>
        {/* Labelled, not placeholder-only: these two fields sit next to each
            other, one takes a URL and one takes a credential, and a placeholder
            disappears the moment either is focused. Pasting a key into the base
            URL field put it in config.toml in plaintext. */}
        <div className="space-y-1">
          <label htmlFor="provider-api-url" className="text-xs text-muted-foreground">
            API base URL (optional; not your API key)
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
          {keyPresent && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPendingClear("key")}
              disabled={busy || clearing}
            >
              <Trash2 className="size-4" /> Remove key
            </Button>
          )}
          {secrets.data?.api_url && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPendingClear("url")}
              disabled={busy || clearing}
            >
              <RotateCcw className="size-4" /> Reset base URL
            </Button>
          )}
          <span className="text-[11px] text-muted-foreground">
            Sets the active provider; key stored encrypted, never shown back.
            Leave the key blank to keep it; use Remove key to clear it.
          </span>
        </div>
      </Card>

      <ConfirmModal
        open={pendingClear !== null}
        onClose={() => setPendingClear(null)}
        title={pendingClear === "url" ? "Reset base URL?" : "Remove API key?"}
        description={
          pendingClear === "url"
            ? "The stored base URL for this provider will be cleared and the provider default used. This does not touch the API key."
            : "The stored API key for this provider will be cleared. The provider will have no credential until you save a new one. This does not touch the base URL."
        }
        confirmLabel={pendingClear === "url" ? "Reset base URL" : "Remove key"}
        icon={pendingClear === "url" ? <RotateCcw className="size-4" /> : undefined}
        busy={clearing}
        onConfirm={clearSecret}
      />

      <PanelFrame
        loading={catalog.loading}
        error={catalog.error}
        loaded={catalog.loaded}
        empty={catalog.loaded && (catalog.data?.providers.length ?? 0) === 0}
        emptyTitle="The provider catalog is empty."
        emptyHint="Refresh to reload it from the gateway."
        onRefresh={catalog.refresh}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.data?.providers.map((p) => (
            // A card that looks selectable now is: it puts the provider in the
            // form above (the same as picking it in the combobox).
            <button
              key={p.id}
              type="button"
              onClick={() => changeProvider(p.id)}
              aria-pressed={p.id === provider}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                p.id === active && "border-accent/50",
                p.id === provider && p.id !== active && "border-ring",
              )}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{p.display_name}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{p.id}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {p.id === active && <Badge variant="accent">active</Badge>}
                {p.local && <Badge variant="success">local</Badge>}
              </div>
            </button>
          ))}
        </div>
      </PanelFrame>
    </div>
  );
}
