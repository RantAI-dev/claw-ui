"use client";

import * as React from "react";
import { Plus, Search, Pencil, Check, X, MessageSquare } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { SessionSummary } from "@/lib/types";

export interface SessionListProps {
  sessions: SessionSummary[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRenamed: (id: string, title: string) => void;
}

export function SessionList({
  sessions,
  loading,
  activeId,
  onSelect,
  onNew,
  onRenamed,
}: SessionListProps) {
  const [query, setQuery] = React.useState("");
  const [editId, setEditId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) => (s.title || "").toLowerCase().includes(q) || (s.model || "").toLowerCase().includes(q),
    );
  }, [sessions, query]);

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
      /* surfaced elsewhere */
    }
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
            placeholder="Filter sessions…"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2 pb-3">
        {loading ? (
          <div className="space-y-1.5 px-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            {sessions.length === 0 ? "No sessions yet." : "No matches."}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((s) => {
              const active = s.id === activeId;
              const editing = editId === s.id;
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
                        <button
                          onClick={() => commitEdit(s.id)}
                          className="text-muted-foreground hover:text-success cursor-pointer"
                        >
                          <Check className="size-3.5" />
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="text-muted-foreground hover:text-destructive cursor-pointer"
                        >
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
                            <span className="block truncate font-medium">
                              {s.title || "Untitled session"}
                            </span>
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
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
