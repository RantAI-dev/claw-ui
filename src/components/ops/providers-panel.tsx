"use client";

import * as React from "react";
import { Check, KeyRound, Trash2, RotateCcw } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { ModelPicker } from "@/components/ui/model-picker";
import { Combobox } from "@/components/ui/combobox";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { CONFIG_CHANGED } from "@/lib/console";
import {
  changes,
  isDirty,
  providerLabel,
  providersVerdict,
  saveSummary,
  type ProvidersVerdict,
  type Server,
} from "@/lib/providers";
import type { ModelCatalog } from "@/lib/types";
import { PanelFrame, RefreshButton, SectionTitle } from "./shared";

/**
 * The page opens with the answer: what the agent talks to right now, and
 * whether that wiring can work. Not a card; the whitespace around the band
 * marks the focal point, as on Status and Channels.
 */
function ProvidersBand({ verdict }: { verdict: ProvidersVerdict }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full"
          style={{
            background: verdict.tone === "ok" ? "var(--accent-green)" : "var(--accent-orange)",
          }}
        />
        <h2 className="text-xl font-medium tracking-tight">{verdict.headline}</h2>
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

/** A dirty draft survives leaving the route: rail navigation unmounts the
 *  panel, and a half-done provider switch (or a pasted key) silently vanished.
 *  Module state only, never storage; dropped when the form unmounts clean. */
let draftCache: { provider: string; model: string; key: string; url: string } | null = null;

/** Test hook: module state would otherwise leak one test's dirty draft into
 *  the next mount. Production never calls this. */
export function resetProvidersDraft() {
  draftCache = null;
}

export function ProvidersPanel() {
  const catalog = useAsync(() => api.providers(), []);
  const secrets = useAsync(() => api.secrets(), []);
  const info = useAsync(() => api.status(), []);
  const [provider, setProvider] = React.useState(draftCache?.provider ?? "");
  const [model, setModel] = React.useState(draftCache?.model ?? "");
  const [key, setKey] = React.useState(draftCache?.key ?? "");
  const [url, setUrl] = React.useState(draftCache?.url ?? "");
  const [busy, setBusy] = React.useState(false);
  // While a restored draft is on screen the server-seeding effects below must
  // not overwrite it; a fresh mount seeds from the server as before.
  const restored = React.useRef(draftCache != null);
  // Explicit clear flow (distinct from blank-Save, which means "keep"): these
  // send an empty string, the gateway's clear-on-empty signal.
  const [pendingClear, setPendingClear] = React.useState<null | "key" | "url">(null);
  const [clearing, setClearing] = React.useState(false);

  React.useEffect(() => {
    if (restored.current) return;
    if (secrets.data?.provider) setProvider(secrets.data.provider);
    // Mirror the server's value even when it is absent. A truthy guard here only
    // ever filled the field and never emptied it, so a base URL that the gateway
    // stopped returning (including one it now withholds because it held an API
    // key) stayed on screen until a page reload.
    setUrl(secrets.data?.api_url ?? "");
  }, [secrets.data?.provider, secrets.data?.api_url]);
  React.useEffect(() => {
    if (restored.current) return;
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

  // Snapshot for the unmount write: keep the draft only while it is dirty.
  const draftRef = React.useRef({ provider, model, key, url, dirty });
  draftRef.current = { provider, model, key, url, dirty };
  React.useEffect(
    () => () => {
      const d = draftRef.current;
      draftCache = d.dirty ? { provider: d.provider, model: d.model, key: d.key, url: d.url } : null;
    },
    [],
  );

  const nextMeta = providers?.find((p) => p.id === provider);
  const activeMeta = providers?.find((p) => p.id === server.provider);
  const nextLabel = providerLabel(provider, providers);
  // A provider was picked and its model is still empty: the list's default
  // fills it as soon as the catalog loads; until then there is nothing to save.
  const needsModel = c.provider && !model;
  const canSave = dirty && !busy && !needsModel && !!provider;
  const slot = needsModel ? `Choose a model for ${nextLabel}` : dirty ? "Unsaved changes" : null;
  const verdict = providersVerdict(
    server,
    !!activeMeta?.local,
    providerLabel(server.provider, providers),
    secrets.data?.encrypt_at_rest,
  );
  // Editors and the catalog only once all three reads have answered: rendering
  // them early painted "none · no key", the same screen as "nothing configured".
  const ready = !!(catalog.data && secrets.data && info.data);
  const localCount = providers?.filter((p) => p.local).length ?? 0;

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
      // Re-read server truth so the band/field reflect what actually persisted.
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
    <div className="max-w-[1120px] space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* All three reads gate the band and everything under it: a failed or
              pending secrets/status read used to render "none · no key". */}
          <PanelFrame
            loading={catalog.loading || secrets.loading || info.loading}
            loadingLabel="Loading providers…"
            error={catalog.error || secrets.error || info.error}
            loaded={catalog.loaded && secrets.loaded && info.loaded}
          >
            {ready && <ProvidersBand verdict={verdict} />}
          </PanelFrame>
        </div>
        <RefreshButton
          onClick={refreshAll}
          spinning={catalog.refreshing || secrets.refreshing || info.refreshing}
        />
      </div>

      {/* The 7/5 split gives the form the width; the catalog scans in the
          narrow column and fills the form on a pick. */}
      {ready && (
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionTitle>Active provider</SectionTitle>
            <Card className="p-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                {/* The form's two groups are its two writes: the model pair goes
                    to config/model, the credential pair to secrets. */}
                <div role="group" aria-labelledby="model-group" className="space-y-3 p-4">
                  <p id="model-group" className="eyebrow">
                    Provider &amp; model
                  </p>
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

                <div role="group" aria-labelledby="credential-group" className="space-y-3 border-t border-border/60 p-4">
                  <p id="credential-group" className="eyebrow">
                    Credential
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="provider-api-key" className="text-xs text-muted-foreground">
                        {provider ? `API key for ${nextLabel}` : "API key"}
                      </label>
                      {server.keyPresent && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setPendingClear("key")}
                          disabled={busy || clearing}
                        >
                          <Trash2 className="size-3.5" /> Remove key
                        </Button>
                      )}
                    </div>
                    <Input
                      id="provider-api-key"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        server.keyPresent
                          ? "Leave blank to keep the stored key"
                          : `Paste the key for ${nextLabel}`
                      }
                    />
                    {server.keyPresent && (
                      <p className="text-xs text-muted-foreground">
                        Leave the key blank to keep it; Remove key clears it.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="provider-api-url" className="text-xs text-muted-foreground">
                        API base URL override (optional)
                      </label>
                      {server.url && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setPendingClear("url")}
                          disabled={busy || clearing}
                        >
                          <RotateCcw className="size-3.5" /> Reset base URL
                        </Button>
                      )}
                    </div>
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
                        Blank keeps the stored URL (<code className="font-mono">{server.url}</code>).
                        Reset base URL clears it.
                      </p>
                    )}
                    {c.provider && server.url && (
                      <p className="text-xs text-muted-foreground">
                        This URL will be used for {nextLabel} too.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-border/60 px-4 py-3">
                  <Button type="submit" size="sm" disabled={!canSave}>
                    <KeyRound className="size-4" /> Save provider &amp; key
                  </Button>
                  <span className="text-xs text-muted-foreground" aria-live="polite">
                    {slot}
                  </span>
                </div>
              </form>
            </Card>
          </div>

          <div className="lg:col-span-5">
            <SectionTitle>
              Catalog{" "}
              {catalog.data && <span className="text-muted-foreground">· {catalog.data.count}</span>}
            </SectionTitle>
            <Card className="p-0">
              <p className="border-b border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
                {localCount} of {catalog.data?.count ?? 0} run locally and need no API key. Picking
                one fills the form; Save applies it.
              </p>
              <ul className="max-h-[440px] overflow-y-auto py-1">
                {providers?.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => changeProvider(p.id)}
                      aria-pressed={p.id === provider}
                      className="flex min-h-9 w-full items-center justify-between gap-3 px-4 py-1.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11"
                    >
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-sm">{p.display_name}</span>
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {p.id}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {p.local && <span className="text-[11px] text-muted-foreground">local</span>}
                        {p.id === provider && <Check aria-hidden className="size-3.5 text-accent" />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}

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
