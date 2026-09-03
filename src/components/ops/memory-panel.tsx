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
  absoluteTime,
  categoryOptions,
  emptyCopy,
  forgetFromTerminal,
  hasSeparator,
  isoTime,
  memoryVerdict,
  originWords,
  rememberToast,
  type MemoryVerdict,
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

/** The two text buttons on the meta line: the shared outline and a coarse-pointer floor. */
const META_BUTTON =
  "-mx-1 rounded-sm px-1 py-1 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-10";

/** Enough of a memory to tell one row from another in a label. */
function previewOf(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 48 ? `${flat.slice(0, 48)}…` : flat;
}

function isClampable(content: string): boolean {
  return content.length > CLAMP_CHARS || content.split("\n").length > 3;
}

/**
 * The page opens with the answer: what will the agent recall on its next turn?
 * Not a card; the whitespace around the band marks the focal point, as on
 * Status, Channels, Providers, Schedules, Skills and Knowledge Bases.
 */
function MemoryBand({ verdict }: { verdict: MemoryVerdict }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full"
          style={{
            background:
              verdict.tone === "ok"
                ? "var(--accent-green)"
                : "var(--accent-orange)",
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
      {verdict.detail && (
        <p className="mt-1.5 text-xs text-muted-foreground">{verdict.detail}</p>
      )}
    </div>
  );
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
  const contentId = React.useId();
  const nameId = React.useId();
  const categoryId = React.useId();

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

  // The band answers from the store, not from the page: filters narrow the
  // list below, never the verdict.
  const stats = useAsync(() => api.memoryStats(), []);
  const refreshAll = () => {
    stats.refresh();
    refresh();
  };

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
      refreshAll();
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
      refreshAll();
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
    <div className="max-w-[1120px] space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {stats.loading && !stats.loaded ? (
            <p className="text-xs text-muted-foreground">Checking recall…</p>
          ) : stats.data ? (
            <MemoryBand verdict={memoryVerdict(stats.data)} />
          ) : null}
        </div>
        <RefreshButton
          onClick={refreshAll}
          spinning={refreshing || stats.refreshing}
        />
      </div>

      {/* The 7/5 split gives the list — the answer — the width; remembering
          something composes in the narrow column. On phones the list comes
          first. */}
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <SectionTitle>
            Memories
            {data && !error && (
              <span className="text-muted-foreground">
                {" · "}
                {narrowed
                  ? total === 0
                    ? "none matching"
                    : `${first}–${last} of ${total} matching`
                  : total > PAGE_SIZE
                    ? `${first}–${last} of ${total}`
                    : String(total)}
              </span>
            )}
          </SectionTitle>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-48">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search memories…"
                aria-label="Search memories"
                className="h-8 pl-7 pr-9 text-xs"
              />
              {search && (
                <IconButton
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1"
                >
                  <X className="size-3.5" />
                </IconButton>
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
              // A narrowed read dims the rows that are there instead of
              // blanking them.
              <div
                className={cn(loading && loaded && "opacity-60")}
                aria-busy={loading && loaded ? true : undefined}
              >
                <Card className="p-0">
                  <ul>
                    {data?.entries.map((e) => {
                      const w = working === e.key;
                      const open = expanded.has(e.key);
                      const clampable = isClampable(e.content);
                      const origin = originWords(e);
                      return (
                        <li
                          key={e.key}
                          data-slot="row"
                          className="border-b border-border/60 px-4 py-3 last:border-b-0"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`min-w-0 flex-1 whitespace-pre-wrap text-sm leading-snug ${
                                clampable && !open ? "line-clamp-3" : ""
                              }`}
                            >
                              {e.content}
                            </p>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Badge
                                variant="secondary"
                                className="text-[11px]"
                              >
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
                          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <time
                              className="shrink-0"
                              dateTime={isoTime(e.timestamp) ?? undefined}
                              title={absoluteTime(e.timestamp) ?? undefined}
                            >
                              {relativeTime(e.timestamp)}
                            </time>
                            {origin && (
                              <>
                                <span>·</span>
                                <span className="shrink-0">{origin}</span>
                              </>
                            )}
                            <span>·</span>
                            {/* A generated key is an address, not a name: 43
                              characters of UUID that only matter when reaching
                              this entry from the API or CLI. Keep it available,
                              clicking copies it, without letting it outweigh
                              the content. */}
                            <button
                              type="button"
                              onClick={() => copyKey(e.key)}
                              title={`Copy key: ${e.key}`}
                              aria-label={`Copy key ${e.key}`}
                              className={cn(
                                "min-w-0 truncate font-mono",
                                META_BUTTON,
                              )}
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
                                  aria-label={`${open ? "Show less" : "Show more"} of ${previewOf(e.content)}`}
                                  className={cn("shrink-0", META_BUTTON)}
                                >
                                  {open ? "Show less" : "Show more"}
                                </button>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </div>
            )}
          </PanelFrame>

          {total > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={loading || offset === 0}
              >
                <ChevronLeft className="size-4" /> Previous
              </Button>
              <span className="text-[11px] tabular-nums text-muted-foreground">
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
        </div>

        <div className="min-w-0 space-y-8 lg:col-span-5">
          <div>
            <SectionTitle>Remember something</SectionTitle>
            <p className="text-xs text-muted-foreground">
              A durable fact or preference the agent should keep. It reaches
              every future conversation.
            </p>
            <Card className="mt-3 space-y-4 p-4">
              <div className="space-y-1.5">
                <label htmlFor={contentId} className="text-xs text-muted-foreground">
                  What to remember
                </label>
                <Textarea
                  id={contentId}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="e.g. Deploys go out on Tuesdays, never on Fridays."
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={nameId} className="text-xs text-muted-foreground">
                  Name (optional)
                </label>
                <Input
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. deploy-window"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? nameErrId : undefined}
                  className="font-mono text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") remember();
                  }}
                />
                {nameError && (
                  <p
                    id={nameErrId}
                    role="alert"
                    className="text-[11px] text-destructive"
                  >
                    {nameError}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor={categoryId} className="text-xs text-muted-foreground">
                  Category
                </label>
                <Input
                  id={categoryId}
                  list={listId}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="core"
                  className="text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") remember();
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                {/* Naming is what makes an entry addressable from the CLI and
                    the API afterwards; unnamed ones get a UUID. */}
                <p className="text-[11px] text-muted-foreground">
                  Without a name the entry gets a generated key.
                </p>
                <Button
                  size="sm"
                  onClick={remember}
                  disabled={busy || !content.trim() || !!nameError}
                >
                  <Plus className="size-4" /> Remember
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

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
