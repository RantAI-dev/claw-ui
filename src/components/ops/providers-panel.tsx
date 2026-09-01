"use client";

import * as React from "react";
import { KeyRound, Trash2, RotateCcw } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { ModelPicker } from "@/components/ui/model-picker";
import { Combobox } from "@/components/ui/combobox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { CONFIG_CHANGED } from "@/lib/console";
import { changes, isDirty, keyState, providerLabel, saveSummary, type Server } from "@/lib/providers";
import type { ModelCatalog } from "@/lib/types";
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
  // Explicit clear flow (distinct from blank-Save, which means "keep"): these
  // send an empty string, the gateway's clear-on-empty signal.
  const [pendingClear, setPendingClear] = React.useState<null | "key" | "url">(null);
  const [clearing, setClearing] = React.useState(false);

  React.useEffect(() => {
    if (secrets.data?.provider) setProvider(secrets.data.provider);
    // Mirror the server's value even when it is absent. A truthy guard here only
    // ever filled the field and never emptied it, so a base URL that the gateway
    // stopped returning (including one it now withholds because it held an API
    // key) stayed on screen until a page reload.
    setUrl(secrets.data?.api_url ?? "");
  }, [secrets.data?.provider, secrets.data?.api_url]);
  React.useEffect(() => {
    if (info.data?.model) setModel(info.data.model);
  }, [info.data?.model]);

  const providers = catalog.data?.providers;
  const server: Server = {
    provider: secrets.data?.provider ?? null,
    model: info.data?.model ?? null,
    url: secrets.data?.api_url ?? null,
    keyPresent: !!secrets.data?.api_key_present,
  };
  const c = changes({ provider, model, key, url }, server);
  const dirty = isDirty(c);
  const nextMeta = providers?.find((p) => p.id === provider);
  const activeMeta = providers?.find((p) => p.id === server.provider);
  const nextLabel = providerLabel(provider, providers);
  const keyBadge = keyState(!!activeMeta?.local, server.keyPresent);
  // A provider was picked and its model is still empty: the list's default
  // fills it as soon as the catalog loads; until then there is nothing to save.
  const needsModel = c.provider && !model;
  const canSave = dirty && !busy && !needsModel && !!provider;
  const slot = needsModel ? `Choose a model for ${nextLabel}` : dirty ? "Unsaved changes" : null;
  // The gateway reports whether the key is encrypted on disk; the page says
  // which one it is instead of promising encryption in static copy.
  const storage = secrets.data
    ? secrets.data.encrypt_at_rest
      ? "Stored encrypted in config.toml."
      : "Stored in plain text in config.toml (secrets.encrypt is off)."
    : null;

  // The picker's catalog callback checks it is still the catalog for the
  // provider on screen before it fills an empty model.
  const providerRef = React.useRef(provider);
  providerRef.current = provider;

  const changeProvider = (next: string) => {
    setProvider(next);
    // A model id belongs to one provider: switching clears it (the catalog's
    // default fills it once the list loads); switching back restores the saved one.
    setModel(next === server.provider ? (server.model ?? "") : "");
  };
  const onCatalog = React.useCallback((cat: ModelCatalog) => {
    if (cat.provider !== providerRef.current) return;
    setModel((m) => m || cat.default || "");
  }, []);

  const refreshAll = () => {
    catalog.refresh();
    secrets.refresh();
    info.refresh();
  };
  // The rail and the composer read provider/model from a 15 s status poll; the
  // shell re-reads on this so they flip with the save, not with the poll.
  const broadcast = () => window.dispatchEvent(new Event(CONFIG_CHANGED));

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
      broadcast();
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
    if (!canSave) return;
    setBusy(true);
    // Provider save is two non-atomic writes (model then secrets). Track whether
    // the first landed so a failure on the second can say the state is split
    // rather than unchanged.
    let modelSwitched = false;
    try {
      // Only what changed goes on the wire: the gateway keeps an omitted field,
      // so a model that did not change must not be re-sent under a new provider.
      const res =
        c.provider || c.model
          ? await api.setConfigModel({
              provider: c.provider ? provider : undefined,
              model: c.model ? model : undefined,
            })
          : null;
      modelSwitched = c.provider || c.model;
      if (c.key || c.url) {
        await api.setSecrets({
          api_key: c.key ? key.trim() : undefined,
          api_url: c.url ? url.trim() : undefined,
        });
      }
      // The gateway's "no usable credential" heads-up rides on the one success
      // toast; not when a key landed in this same save, and not for a local
      // provider, which needs none (the gateway does not consult `local`).
      const warning = res?.warning && !nextMeta?.local && !c.key ? res.warning : undefined;
      toast.success(saveSummary(c, nextLabel, model), { description: warning });
      setKey("");
      broadcast();
    } catch (e) {
      const detail = describeApiError(e);
      toast.error(
        modelSwitched
          ? `Provider/model switched, but saving the key/URL failed: ${detail}`
          : `Save failed: ${detail}`,
      );
    } finally {
      // Always re-read server truth, even on a partial failure, so the panel
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
            onClick={refreshAll}
            spinning={catalog.refreshing || secrets.refreshing || info.refreshing}
          />
        }
      >
        Active provider
      </SectionTitle>

      {/* All three reads gate the card: a failed or pending secrets/status read
          used to render "none · no key", the same screen as "nothing configured". */}
      <PanelFrame
        loading={catalog.loading || secrets.loading || info.loading}
        loadingLabel="Loading providers…"
        error={catalog.error || secrets.error || info.error}
        loaded={catalog.loaded && secrets.loaded && info.loaded}
      >
        <Card className="p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="space-y-3"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Currently:</span>
              <Badge variant="accent">{providerLabel(server.provider, providers)}</Badge>
              <Badge variant={keyBadge.variant}>{keyBadge.label}</Badge>
              {storage && <span className="text-[11px]">{storage}</span>}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label id="provider-label" className="text-xs text-muted-foreground">
                  Provider
                </label>
                <Combobox
                  id="provider-picker"
                  ariaLabelledBy="provider-label"
                  items={(providers ?? []).map((p) => ({
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
              </div>
              <div className="space-y-1">
                <label id="model-label" className="text-xs text-muted-foreground">
                  Model
                </label>
                <ModelPicker
                  ariaLabelledBy="model-label"
                  provider={provider}
                  value={model}
                  onChange={setModel}
                  // The saved model is "default" only under the provider it belongs
                  // to; under a newly picked one the list says "Choose model…".
                  defaultModel={provider === server.provider ? (server.model ?? undefined) : undefined}
                  onCatalog={onCatalog}
                />
              </div>
            </div>
            {/* Labelled, not placeholder-only: these two fields sit next to each
                other, one takes a URL and one takes a credential, and a placeholder
                disappears the moment either is focused. Pasting a key into the base
                URL field put it in config.toml in plaintext. */}
            <div className="space-y-1">
              <label htmlFor="provider-api-url" className="text-xs text-muted-foreground">
                API base URL override (optional)
              </label>
              <Input
                id="provider-api-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                autoComplete="off"
              />
              {/* The gateway stores one base URL, not one per provider; the copy
                  says so rather than implying a switch leaves it behind. */}
              <p className="text-xs text-muted-foreground">
                One value, used by whichever provider is active. Not your API key.
              </p>
              {url.trim() === "" && server.url && (
                <p className="text-xs text-muted-foreground">
                  Blank keeps the stored URL (<code className="font-mono">{server.url}</code>). Reset base
                  URL clears it.
                </p>
              )}
              {c.provider && server.url && (
                <p className="text-xs text-muted-foreground">This URL will be used for {nextLabel} too.</p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="provider-api-key" className="text-xs text-muted-foreground">
                {provider ? `API key for ${nextLabel}` : "API key"}
              </label>
              <Input
                id="provider-api-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder={
                  server.keyPresent ? "Leave blank to keep the stored key" : `Paste the key for ${nextLabel}`
                }
              />
              {server.keyPresent && (
                <p className="text-xs text-muted-foreground">
                  Leave the key blank to keep it; Remove key clears it.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={!canSave}>
                <KeyRound className="size-4" /> Save provider &amp; key
              </Button>
              {server.keyPresent && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPendingClear("key")}
                  disabled={busy || clearing}
                >
                  <Trash2 className="size-4" /> Remove key
                </Button>
              )}
              {server.url && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPendingClear("url")}
                  disabled={busy || clearing}
                >
                  <RotateCcw className="size-4" /> Reset base URL
                </Button>
              )}
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {slot}
              </span>
            </div>
          </form>
        </Card>
      </PanelFrame>

      <ConfirmModal
        open={pendingClear !== null}
        onClose={() => setPendingClear(null)}
        title={pendingClear === "url" ? "Reset base URL?" : "Remove API key?"}
        description={
          pendingClear === "url"
            ? "The stored base URL override is cleared and the provider's own endpoint is used. This does not touch the API key."
            : "The stored API key is cleared. The provider has no credential until you save a new one. This does not touch the base URL."
        }
        confirmLabel={pendingClear === "url" ? "Reset base URL" : "Remove key"}
        icon={pendingClear === "url" ? <RotateCcw className="size-4" /> : undefined}
        tone={pendingClear === "url" ? "default" : "destructive"}
        busy={clearing}
        onConfirm={clearSecret}
      />
    </div>
  );
}
