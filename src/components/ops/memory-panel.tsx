"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Inbox,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ApiError, api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { cn, relativeTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import { isGeneratedMemoryKey } from "@/lib/recalled-memories";
import {
  NAME_SEPARATOR_MESSAGE,
  categoryOptions,
  emptyCopy,
  forgetFromTerminal,
  hasSeparator,
  originWords,
  rememberToast,
} from "@/lib/memory";
import {
  EmptyState,
  IconButton,
  PanelFrame,
  RefreshButton,
  SectionTitle,
} from "./shared";

/** Rows per page. The route caps a page at 500; 50 keeps one screen scannable. */
const PAGE_SIZE = 50;

/** Content longer than this gets a "Show more" toggle instead of a silent clamp. */
const CLAMP_CHARS = 180;

type RememberBody = { content: string; category: string; key?: string };

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
  const [filterText, setFilterText] = React.useState("");
  const [filter, setFilter] = React.useState("");
  const [offset, setOffset] = React.useState(0);

  const [content, setContent] = React.useState("");
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("core");
  const [busy, setBusy] = React.useState(false);
  const [working, setWorking] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [pendingForget, setPendingForget] = React.useState<{
    key: string;
    content: string;
    /** A key with a separator: the proxy refuses the delete, so explain instead. */
    blocked: boolean;
  } | null>(null);
  const [pendingReplace, setPendingReplace] = React.useState<{
    key: string;
    oldContent: string;
    body: RememberBody;
  } | null>(null);
  const nameErrId = React.useId();
  const listId = React.useId();

  // Typing shouldn't fire a request per keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  React.useEffect(() => {
    const t = setTimeout(() => setFilter(filterText.trim()), 250);
    return () => clearTimeout(t);
  }, [filterText]);

  // A narrower result set makes the current page number meaningless.
  React.useEffect(() => {
    setOffset(0);
  }, [query, filter]);

  const { data, loading, error, refreshing, loaded, refresh } = useAsync(
    () => api.memory(PAGE_SIZE, offset, { q: query, category: filter }),
    [offset, query, filter],
  );

  const total = data?.total ?? 0;
  const first = total === 0 ? 0 : offset + 1;
  const last = offset + (data?.count ?? 0);
  const narrowed = !!query.trim() || !!filter;
  // The store accepts any category name, so the pickers offer the built-ins
  // plus whatever is on screen and take a typed name as well.
  const present = React.useMemo(
    () => data?.entries.map((e) => e.category) ?? [],
    [data],
  );
  const options = categoryOptions(present, filter || category);

  const nameError = hasSeparator(name) ? NAME_SEPARATOR_MESSAGE : null;

  const store = async (body: RememberBody, replaced: boolean) => {
    setBusy(true);
    try {
      const stored = await api.addMemory(body);
      toast.success(
        rememberToast({
          key: stored.key,
          named: !!body.key,
          replaced,
          notes: stored.notes ?? [],
        }),
      );
      setContent("");
      setName("");
      setPendingReplace(null);
      refresh();
    } catch (e) {
      toast.error(`Could not remember that: ${describeApiError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const remember = async () => {
    if (!content.trim() || nameError) return;
    const key = name.trim();
    const body: RememberBody = {
      content: content.trim(),
      category: category.trim() || "core",
      ...(key ? { key } : {}),
    };
    if (!key) return store(body, false);
    // The gateway upserts by key and keeps the old timestamp, so this is the
    // only place a person can be warned before a named memory is overwritten.
    setBusy(true);
    try {
      const existing = await api.getMemory(key);
      setPendingReplace({ key, oldContent: existing.content, body });
      setBusy(false);
      return;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) {
        toast.error(
          `Could not check whether “${key}” already exists: ${describeApiError(e)}`,
        );
        setBusy(false);
        return;
      }
    }
    await store(body, false);
  };

  const copyText = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
    } catch {
      // Clipboard is blocked outside a secure context; show the text so it can
      // still be selected by hand rather than failing silently.
      toast.message(text);
    }
  };
  const copyKey = (key: string) => copyText(key, "Key copied");

  const forget = async () => {
    const key = pendingForget?.key;
    if (!key) return;
    setWorking(key);
    try {
      const r = await api.deleteMemory(key);
      // `removed: false` is a successful request about nothing: the entry was
      // already gone. Say so instead of claiming this click forgot it.
      if (r.removed) toast.success("Forgotten");
      else toast.message("That memory was already gone.");
      refresh();
    } catch (e) {
      toast.error(`Could not forget that: ${describeApiError(e)}`);
    } finally {
      // Close on every outcome; a failure that keeps the confirm open only
      // invites a retry that fails the same way.
      setPendingForget(null);
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
      <SectionTitle
        action={<RefreshButton onClick={refresh} spinning={refreshing} />}
      >
        Memories
        {/* No range beside an error: the strip under it explains, and a count
            from before the failure would contradict it. */}
        {data && !error && (
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
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrId : undefined}
            className="h-8 w-44 font-mono text-xs"
          />
          <Input
            list={listId}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
            placeholder="core"
            className="h-8 w-36 text-xs"
          />
          <Button
            size="sm"
            onClick={remember}
            disabled={busy || !content.trim() || !!nameError}
          >
            <Plus className="size-4" /> Remember
          </Button>
        </div>
        {nameError && (
          <p
            id={nameErrId}
            role="alert"
            className="text-[11px] text-destructive"
          >
            {nameError}
          </p>
        )}
        {/* Naming is what makes an entry addressable from the CLI and the API
            afterwards; unnamed ones get a UUID that means nothing to a reader. */}
        <p className="text-[10px] text-muted-foreground">
          Without a name the entry gets a generated key.
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
        <Input
          list={listId}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          aria-label="Filter by category"
          placeholder="All categories"
          className="h-8 w-40 text-xs"
        />
        <datalist id={listId}>
          {options.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <PanelFrame
        loading={loading && !loaded}
        error={error}
        loaded={loaded}
        loadingLabel="Loading memories…"
        onRefresh={refresh}
      >
        {!error && data && data.count === 0 ? (
          (() => {
            const copy = emptyCopy({ query, filter });
            return (
              <EmptyState
                icon={<Inbox className="size-6" />}
                title={copy.title}
                hint={copy.hint}
                action={
                  copy.action === "clear-search" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSearch("")}
                    >
                      Clear search
                    </Button>
                  ) : copy.action === "clear-filter" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilterText("")}
                    >
                      Show all categories
                    </Button>
                  ) : undefined
                }
              />
            );
          })()
        ) : (
          // A narrowed read dims the rows that are there instead of blanking them.
          <div
            className={cn("space-y-2", loading && loaded && "opacity-60")}
            aria-busy={loading && loaded ? true : undefined}
          >
            {data?.entries.map((e) => {
              const w = working === e.key;
              const open = expanded.has(e.key);
              const clampable = isClampable(e.content);
              const origin = originWords(e);
              return (
                <Card key={e.key} data-slot="row" className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`min-w-0 flex-1 whitespace-pre-wrap text-sm leading-snug ${
                        clampable && !open ? "line-clamp-3" : ""
                      }`}
                    >
                      {e.content}
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {e.category}
                      </Badge>
                      <IconButton
                        onClick={() =>
                          setPendingForget({
                            key: e.key,
                            content: e.content,
                            blocked: hasSeparator(e.key),
                          })
                        }
                        disabled={w}
                        title={`Forget "${previewOf(e.content)}"`}
                        aria-label={`Forget "${previewOf(e.content)}"`}
                        className="hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {w ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </IconButton>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="shrink-0">
                      {relativeTime(e.timestamp)}
                    </span>
                    {origin && (
                      <>
                        <span>·</span>
                        <span className="shrink-0">{origin}</span>
                      </>
                    )}
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
                      {isGeneratedMemoryKey(e.key) ? "copy key" : e.key}
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
        )}
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
            Page {Math.floor(offset / PAGE_SIZE) + 1} of{" "}
            {Math.ceil(total / PAGE_SIZE)}
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
        open={!!pendingReplace}
        onClose={() => !busy && setPendingReplace(null)}
        title={`Replace “${pendingReplace?.key ?? ""}”?`}
        description={
          pendingReplace ? (
            <>
              A memory with this name already exists and will be overwritten. It
              currently says:{" "}
              <span className="italic">
                “{pendingReplace.oldContent.slice(0, 140)}
                {pendingReplace.oldContent.length > 140 ? "…" : ""}”
              </span>
            </>
          ) : undefined
        }
        confirmLabel="Replace"
        icon={null}
        tone="default"
        busy={busy}
        onConfirm={() => pendingReplace && store(pendingReplace.body, true)}
      />

      {/* The proxy refuses a decoded separator in any path segment (a traversal
          guard), so a key with one can only be removed from a terminal. */}
      <Modal
        open={!!pendingForget?.blocked}
        onClose={() => setPendingForget(null)}
        title="This memory can't be forgotten here"
        description="Its name contains a slash, which this console cannot address. Remove it from a terminal:"
        footer={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              pendingForget &&
              copyText(forgetFromTerminal(pendingForget.key), "Command copied")
            }
            data-autofocus
          >
            <Copy className="size-4" /> Copy command
          </Button>
        }
      >
        <code className="block select-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
          {pendingForget ? forgetFromTerminal(pendingForget.key) : ""}
        </code>
      </Modal>

      <ConfirmModal
        open={!!pendingForget && !pendingForget.blocked}
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
