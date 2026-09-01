"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ModelCatalog } from "@/lib/types";
import { Combobox, type ComboboxItem } from "./combobox";

/**
 * Model combobox. Self-contained: given a `provider`, it fetches the catalog from
 * the gateway (the SAME cache + curated fallback the TUI uses) so the list never
 * drifts. Renders the shared {@link Combobox} so it looks identical to the
 * provider picker. Type to filter; pick from the list; or type any id and "Use …"
 * to set a custom model. The refresh footer repopulates the shared cache; when
 * the live fetch fails the gateway still answers with the cached or curated list
 * and `refreshed: false`, which the footer says instead of swallowing it. A
 * failed load is told apart from an empty list for the same reason.
 */
export function ModelPicker({
  provider,
  value,
  onChange,
  defaultModel,
  className,
  compact = false,
  ariaLabelledBy,
  onCatalog,
}: {
  provider: string;
  value: string;
  onChange: (model: string) => void;
  defaultModel?: string;
  className?: string;
  compact?: boolean;
  /** id of the visible label naming this picker. */
  ariaLabelledBy?: string;
  /** Called with the catalog once it has loaded (or been refreshed) for the current `provider`. */
  onCatalog?: (catalog: ModelCatalog) => void;
}) {
  const [catalog, setCatalog] = React.useState<ModelCatalog | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [refreshNote, setRefreshNote] = React.useState<string | null>(null);
  // Read through a ref so a new callback identity does not refetch the list.
  const onCatalogRef = React.useRef(onCatalog);
  onCatalogRef.current = onCatalog;

  React.useEffect(() => {
    setRefreshNote(null);
    if (!provider) {
      setCatalog(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .providerModels(provider)
      .then((c) => {
        if (cancelled) return;
        setCatalog(c);
        setLoadError(null);
        onCatalogRef.current?.(c);
      })
      .catch((e) => {
        if (cancelled) return;
        setCatalog(null);
        setLoadError(describeApiError(e));
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
      setCatalog(c);
      setLoadError(null);
      onCatalogRef.current?.(c);
      setRefreshNote(
        c.refreshed === false
          ? `Live list unavailable (no key, or the provider is unreachable); showing the ${
              c.source === "cache" ? "cached" : "suggested"
            } list.`
          : null,
      );
    } catch (e) {
      setRefreshNote(`Refresh failed: ${describeApiError(e)}`);
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
        {loadError
          ? "List not loaded"
          : catalog
            ? `${catalog.count} ${catalog.source === "cache" ? "cached" : "suggested"}`
            : "No list"}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        className="flex min-h-8 items-center gap-1 px-1 hover:text-foreground disabled:opacity-50 pointer-coarse:min-h-10"
      >
        <RefreshCw className={cn("size-3", refreshing && "animate-spin")} /> refresh
      </button>
      {refreshNote && <p className="basis-full text-foreground">{refreshNote}</p>}
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
        loadError
          ? "The model list could not be loaded. Use refresh to retry, or type an id."
          : "No models listed. Type an id to use a custom one."
      }
      disabled={!provider}
      loading={loading}
      compact={compact}
      mono
      allowCustom
      footer={footer}
      className={className}
      ariaLabelledBy={ariaLabelledBy}
    />
  );
}
