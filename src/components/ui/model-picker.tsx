"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ModelCatalog } from "@/lib/types";
import { Combobox, type ComboboxItem } from "./combobox";

/**
 * Model combobox. Self-contained: given a `provider`, it fetches the catalog from
 * the gateway (the SAME cache + curated fallback the TUI uses) so the list never
 * drifts. Renders the shared {@link Combobox} so it looks identical to the
 * provider picker. Type to filter; pick from the list; or type any id and "Use …"
 * to set a custom model. The ↻ refresh footer repopulates the shared cache.
 */
export function ModelPicker({
  provider,
  value,
  onChange,
  defaultModel,
  className,
  compact = false,
  onCatalog,
}: {
  provider: string;
  value: string;
  onChange: (model: string) => void;
  defaultModel?: string;
  className?: string;
  compact?: boolean;
  /** Called whenever the catalog changes, so a parent can read its default. */
  onCatalog?: (catalog: ModelCatalog | null) => void;
}) {
  const [catalog, setCatalog] = React.useState<ModelCatalog | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  // A failed fetch must not read as "this provider has no models".
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    onCatalog?.(catalog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  React.useEffect(() => {
    if (!provider) {
      setCatalog(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    api
      .providerModels(provider)
      .then((c) => !cancelled && setCatalog(c))
      .catch(() => {
        if (cancelled) return;
        setCatalog(null);
        setFailed(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const refresh = async () => {
    if (!provider || refreshing) return;
    setRefreshing(true);
    try {
      const c = await api.refreshProviderModels(provider);
      // The route answers 200 with refreshed:false when the provider returned
      // nothing; without this the spinner just stopped and the list stayed put.
      if (c.refreshed === false) {
        toast.error(c.detail || `${provider} returned no model list; showing the built-in one.`);
      }
      setCatalog(c);
      setFailed(false);
    } catch {
      // Keep the current list; the footer says the refresh did not land.
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  };

  const items: ComboboxItem[] = (catalog?.models ?? []).map((m) => ({
    value: m,
    label: m,
    hint: m === defaultModel ? "default" : undefined,
  }));

  const footer = (
    <>
      <span>
        {failed
          ? "catalog unavailable"
          : catalog
            ? `${catalog.count} ${catalog.source === "cache" ? "cached" : "suggested"}`
            : "no catalog"}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        className="flex items-center gap-1 hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={cn("size-3", refreshing && "animate-spin")} /> Refresh
      </button>
    </>
  );

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder={defaultModel || (provider ? "Choose model…" : "Pick a provider first")}
      searchPlaceholder="Search or type a model id…"
      emptyText={
        failed
          ? "Couldn't load the model catalog. Type a model id to use it anyway."
          : "No models match. Type an id to use a custom one."
      }
      disabled={!provider}
      loading={loading}
      compact={compact}
      mono
      allowCustom
      footer={footer}
      className={className}
    />
  );
}
