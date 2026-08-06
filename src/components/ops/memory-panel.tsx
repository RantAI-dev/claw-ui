"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { relativeTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { toast } from "sonner";
import { MEMORY_CATEGORIES } from "@/lib/types";
import { IconButton, PanelFrame, RefreshButton, SectionTitle } from "./shared";

/** Rows per page. The route caps a page at 500; 50 keeps one screen scannable. */
const PAGE_SIZE = 50;

/** Content longer than this gets a "Show more" toggle instead of a silent clamp. */
const CLAMP_CHARS = 180;

/** Keys the server generates when the caller supplied none. */
function isGeneratedKey(key: string): boolean {
  return /^memory_[0-9a-f-]{36}$/i.test(key);
}

/** Enough of a memory to tell one row from another in a label. */
function previewOf(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 48 ? `${flat.slice(0, 48)}…` : flat;
}

function isClampable(content: string): boolean {
  return content.length > CLAMP_CHARS || content.split("\n").length > 3;
}

export function MemoryPanel() {
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("");
  const [offset, setOffset] = React.useState(0);

  const [content, setContent] = React.useState("");
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("core");
  const [busy, setBusy] = React.useState(false);
  const [working, setWorking] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [pendingForget, setPendingForget] = React.useState<{ key: string; content: string } | null>(
    null,
  );

  // Typing shouldn't fire a request per keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // A narrower result set makes the current page number meaningless.
  React.useEffect(() => {
    setOffset(0);
  }, [query, filter]);

  const { data, loading, error, refresh } = useAsync(
    () => api.memory(PAGE_SIZE, offset, { q: query, category: filter }),
    [offset, query, filter],
  );

  const total = data?.total ?? 0;
  const first = total === 0 ? 0 : offset + 1;
  const last = offset + (data?.count ?? 0);
  const narrowed = !!query.trim() || !!filter;

  const remember = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      const stored = await api.addMemory({
        content: content.trim(),
        category,
        ...(name.trim() ? { key: name.trim() } : {}),
      });
      toast.success(
        stored.notes?.length
          ? `Remembered as ${stored.key} — ${stored.notes.join("; ")}`
          : `Remembered as ${stored.key}`,
      );
      setContent("");
      setName("");
      refresh();
    } catch (e) {
      toast.error(`Could not remember that: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success("Key copied");
    } catch {
      // Clipboard is blocked outside a secure context; show the key so it can
      // still be selected by hand rather than failing silently.
      toast.message(key);
    }
  };

  const forget = async () => {
    const key = pendingForget?.key;
    if (!key) return;
    setWorking(key);
    try {
      await api.deleteMemory(key);
      toast.success("Forgotten");
      setPendingForget(null);
      refresh();
    } catch (e) {
      toast.error(`Could not forget that: ${e instanceof Error ? e.message : e}`);
    } finally {
      setWorking(null);
    }
  };

  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="space-y-4">
      <SectionTitle action={<RefreshButton onClick={refresh} />}>
        Memories
        {data && (
          <span className="text-muted-foreground">
            {" · "}
            {total === 0 ? "none" : `${first}–${last} of ${total}`}
            {narrowed ? " matching" : ""}
          </span>
        )}
      </SectionTitle>

      <Card className="space-y-2 p-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Remember something
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="A durable fact or preference the agent should remember…"
          rows={2}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            aria-label="Name this memory (optional)"
            className="h-8 w-44 font-mono text-xs"
          />
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
            className="h-8 font-mono text-xs"
          >
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={remember} disabled={busy || !content.trim()}>
            <Plus className="size-4" /> Remember
          </Button>
        </div>
        {/* Naming is what makes an entry addressable from the CLI and the API
            afterwards; unnamed ones get a UUID that means nothing to a reader. */}
        <p className="text-[10px] text-muted-foreground">
          Without a name the agent generates one.
        </p>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories…"
            aria-label="Search memories"
            className="h-8 pl-7 pr-7 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter by category"
          className="h-8 font-mono text-xs"
        >
          <option value="">All categories</option>
          {MEMORY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      <PanelFrame loading={loading} error={error} empty={data?.count === 0} onRefresh={refresh}>
        <div className="space-y-2">
          {data?.entries.map((e) => {
            const w = working === e.key;
            const open = expanded.has(e.key);
            const clampable = isClampable(e.content);
            return (
              <Card key={e.key} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`min-w-0 flex-1 whitespace-pre-wrap text-sm leading-snug ${
                      clampable && !open ? "line-clamp-3" : ""
                    }`}
                  >
                    {e.content}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {typeof e.score === "number" && (
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        {Math.round(e.score * 100)}%
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {e.category}
                    </Badge>
                    <IconButton
                      onClick={() => setPendingForget({ key: e.key, content: e.content })}
                      disabled={w}
                      title={`Forget "${previewOf(e.content)}"`}
                      aria-label={`Forget "${previewOf(e.content)}"`}
                      className="hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      {w ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    </IconButton>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="shrink-0">{relativeTime(e.timestamp)}</span>
                  <span>·</span>
                  {/* A generated key is an address, not a name: it is 43
                      characters of UUID that only matters when reaching this
                      entry from the API or CLI. Keep it available — clicking
                      copies it — without letting it outweigh the content. */}
                  <button
                    type="button"
                    onClick={() => copyKey(e.key)}
                    title={`Copy key: ${e.key}`}
                    className="min-w-0 truncate rounded-sm font-mono transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {isGeneratedKey(e.key) ? "copy key" : e.key}
                  </button>
                  {clampable && (
                    <>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(e.key)}
                        aria-expanded={open}
                        className="shrink-0 rounded-sm transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {open ? "Show less" : "Show more"}
                      </button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </PanelFrame>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            disabled={loading || offset === 0}
          >
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {first}–{last} of {total}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            disabled={loading || last >= total}
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      <ConfirmModal
        open={!!pendingForget}
        onClose={() => setPendingForget(null)}
        title="Forget this memory?"
        description={
          pendingForget
            ? `The agent will no longer recall: “${pendingForget.content.slice(0, 140)}${
                pendingForget.content.length > 140 ? "…" : ""
              }”`
            : undefined
        }
        confirmLabel="Forget"
        busy={!!working}
        onConfirm={forget}
      />
    </div>
  );
}
