"use client";

import * as React from "react";
import { Plus, Search, Pencil, Check, X, MessageSquare, Trash2, Loader2 } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { SearchResult, SessionSummary } from "@/lib/types";

export interface SessionListProps {
  sessions: SessionSummary[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRenamed: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

function toMs(ts: number | string | null): number {
  let n = typeof ts === "string" ? Number(ts) : ts ?? 0;
  if (!Number.isFinite(n)) n = 0;
  if (n > 0 && n < 1e12) n *= 1000;
  return n;
}

function bucketOf(ms: number): string {
  if (!ms) return "Older";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (ms >= startToday) return "Today";
  if (ms >= startToday - day) return "Yesterday";
  if (ms >= startToday - 7 * day) return "Previous 7 days";
  return "Older";
}

const BUCKET_ORDER = ["Today", "Yesterday", "Previous 7 days", "Older"];

export function SessionList({
  sessions,
  loading,
  activeId,
  onSelect,
  onNew,
  onRenamed,
  onDelete,
}: SessionListProps) {
  const [query, setQuery] = React.useState("");
  const [editId, setEditId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [serverResults, setServerResults] = React.useState<SearchResult[] | null>(null);
  const [searching, setSearching] = React.useState(false);

  // Debounced full-text search across message content.
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setServerResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { results } = await api.searchSessions(q, 30);
        setServerResults(results);
      } catch {
        setServerResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const titleFiltered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) => (s.title || "").toLowerCase().includes(q) || (s.model || "").toLowerCase().includes(q),
    );
  }, [sessions, query]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, SessionSummary[]>();
    for (const s of titleFiltered) {
      const b = bucketOf(toMs(s.started_at));
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(s);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => [b, map.get(b)!] as const);
  }, [titleFiltered]);

  const startEdit = (s: SessionSummary) => {
    setEditId(s.id);
    setDraft(s.title || "");
  };
  const commitEdit = async (id: string) => {
    const title = draft.trim();
    setEditId(null);
    if (!title) return;
    try {
      await api.setSessionTitle(id, title);
      onRenamed(id, title);
    } catch {
      /* surfaced upstream */
    }
  };

  const renderRow = (s: SessionSummary) => {
    const active = s.id === activeId;
    const editing = editId === s.id;
    const confirming = confirmId === s.id;
    return (
      <li key={s.id}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors",
            active ? "bg-secondary" : "hover:bg-secondary/60",
          )}
        >
          {editing ? (
            <>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit(s.id);
                  if (e.key === "Escape") setEditId(null);
                }}
                className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button onClick={() => commitEdit(s.id)} className="text-muted-foreground hover:text-success cursor-pointer">
                <Check className="size-3.5" />
              </button>
              <button onClick={() => setEditId(null)} className="text-muted-foreground hover:text-destructive cursor-pointer">
                <X className="size-3.5" />
              </button>
            </>
          ) : confirming ? (
            <>
              <span className="min-w-0 flex-1 truncate text-xs text-destructive">Delete this session?</span>
              <button
                onClick={() => {
                  setConfirmId(null);
                  onDelete(s.id);
                }}
                className="text-destructive hover:opacity-80 cursor-pointer"
                title="Confirm delete"
              >
                <Check className="size-3.5" />
              </button>
              <button onClick={() => setConfirmId(null)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X className="size-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onSelect(s.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
              >
                <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.title || "Untitled session"}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {s.message_count} msgs · {relativeTime(s.started_at)}
                    {s.model ? ` · ${s.model}` : ""}
                  </span>
                </span>
              </button>
              <button
                onClick={() => startEdit(s)}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 cursor-pointer"
                title="Rename"
              >
                <Pencil className="size-3" />
              </button>
              <button
                onClick={() => setConfirmId(s.id)}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 cursor-pointer"
                title="Delete"
              >
                <Trash2 className="size-3" />
              </button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2 p-3">
        <Button onClick={onNew} size="sm" className="flex-1">
          <Plus className="size-4" /> New chat
        </Button>
      </div>
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions & messages…"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-7 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {searching && (
            <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2 pb-3">
        {loading ? (
          <div className="space-y-1.5 px-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <>
            {grouped.length === 0 && !serverResults?.length ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                {sessions.length === 0 ? "No sessions yet." : "No matches."}
              </div>
            ) : (
              grouped.map(([bucket, items]) => (
                <div key={bucket} className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {bucket}
                  </div>
                  <ul className="space-y-0.5">{items.map(renderRow)}</ul>
                </div>
              ))
            )}

            {serverResults && serverResults.length > 0 && (
              <div className="mt-2 border-t border-border pt-2">
                <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Message matches
                </div>
                <ul className="space-y-0.5">
                  {serverResults.map((r, i) => (
                    <li key={`${r.session_id}-${i}`}>
                      <button
                        onClick={() => onSelect(r.session_id)}
                        className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary/60 cursor-pointer"
                      >
                        <span className="block truncate text-xs font-medium">
                          {r.session_title || "Untitled session"}
                        </span>
                        <span className="line-clamp-2 text-[11px] text-muted-foreground">
                          <span className="text-accent">{r.role}:</span> {r.content}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
