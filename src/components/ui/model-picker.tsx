"use client";

import * as React from "react";
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
}: {
  provider: string;
  value: string;
  onChange: (model: string) => void;
  defaultModel?: string;
  className?: string;
  compact?: boolean;
}) {
  const [catalog, setCatalog] = React.useState<ModelCatalog | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    if (!provider) {
      setCatalog(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .providerModels(provider)
      .then((c) => !cancelled && setCatalog(c))
      .catch(() => !cancelled && setCatalog(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const refresh = async () => {
    if (!provider || refreshing) return;
    setRefreshing(true);
    try {
      setCatalog(await api.refreshProviderModels(provider));
    } catch {
      /* keep current list on failure */
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
        {catalog ? `${catalog.count} ${catalog.source === "cache" ? "cached" : "suggested"}` : "—"}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        className="flex items-center gap-1 hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={cn("size-3", refreshing && "animate-spin")} /> refresh
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
      emptyText="No models — type an id to use a custom one."
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
