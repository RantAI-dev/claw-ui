"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  MessageSquare,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError, api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { relativeTime } from "@/lib/utils";
import type { SearchResult, SessionSummary } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import {
  CONVERSATION_BUSY_MESSAGE,
  RECORDINGS_EMPTY,
  absoluteTime,
  deleteConversationText,
  groupRecordings,
  isoTime,
  removedToast,
  type RecordingGroup,
} from "@/lib/memory";
import { EmptyState, IconButton, PanelFrame, SectionTitle } from "./shared";

/** Sessions per page. A conversation's rows can fall on two pages. */
const PAGE_SIZE = 50;

type Listing =
  | { kind: "list"; sessions: SessionSummary[]; count: number; total: number }
  | { kind: "search"; results: SearchResult[] };

function title(s: { title: string | null }): string {
  return s.title?.trim() || "Untitled recording";
}

/** One recording's transcript, read-only. */
function Transcript({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, error, loading, loaded, refresh } = useAsync(() => api.session(id), [id]);
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-3">
        <ChevronLeft className="size-4" /> Back to recordings
      </Button>
      <PanelFrame
        loading={loading && !loaded}
        error={error}
        loaded={loaded}
        loadingLabel="Loading the recording…"
        onRefresh={refresh}
      >
        {data && (
          <>
            <SectionTitle>{title(data)}</SectionTitle>
            <Card className="p-0">
              <ul>
                {data.messages.map((m, i) => (
                  <li
                    key={i}
                    className="border-b border-border/60 px-4 py-3 last:border-b-0"
                  >
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant="secondary" className="text-[11px]">
                        {m.role}
                      </Badge>
                      {m.timestamp != null && (
                        <time
                          dateTime={isoTime(m.timestamp) ?? undefined}
                          title={absoluteTime(m.timestamp) ?? undefined}
                        >
                          {relativeTime(m.timestamp)}
                        </time>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-snug">{m.content}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </PanelFrame>
    </div>
  );
}

/**
 * Recorded channel conversations: listed by conversation, searchable, readable
 * and deletable. Read-only otherwise; the agent writes the recordings.
 */
export function MemoryRecordings({ refreshSignal }: { refreshSignal: number }) {
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [offset, setOffset] = React.useState(0);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<RecordingGroup | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // Typing shouldn't fire a request per keystroke.
  // A narrower result set makes the current page number meaningless.
  React.useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, error, loading, loaded, refresh } = useAsync<Listing>(async () => {
    if (query) {
      const r = await api.searchSessions(query, 30, "channel");
      return { kind: "search", results: r.results };
    }
    const r = await api.sessions(PAGE_SIZE, offset, "channel");
    return { kind: "list", sessions: r.sessions, count: r.count, total: r.total ?? r.count };
  }, [query, offset]);

  // The panel's Refresh button sits above both tabs and bumps this signal.
  const handled = React.useRef(refreshSignal);
  React.useEffect(() => {
    if (handled.current === refreshSignal) return;
    handled.current = refreshSignal;
    refresh();
  }, [refreshSignal, refresh]);

  const groups = React.useMemo(
    () => (data?.kind === "list" ? groupRecordings(data.sessions) : []),
    [data],
  );

  const confirmDelete = async () => {
    if (!pending) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const r = await api.deleteSession(pending.recordings[0].id);
      if (r.deleted) toast.success(removedToast(r.sessions_removed));
      else toast.message("That conversation was already gone.");
      setPending(null);
      refresh();
    } catch (e) {
      // A turn is running in that conversation: nothing was deleted, so the
      // dialog stays open and says why instead of closing as if it worked.
      setDeleteError(
        e instanceof ApiError && e.status === 409
          ? CONVERSATION_BUSY_MESSAGE
          : describeApiError(e),
      );
    } finally {
      setDeleting(false);
    }
  };

  if (openId) return <Transcript id={openId} onBack={() => setOpenId(null)} />;

  const empty =
    data?.kind === "search"
      ? data.results.length === 0
      : data?.kind === "list" && groups.length === 0;
  const total = data?.kind === "list" ? data.total : 0;
  const last = offset + (data?.kind === "list" ? data.count : 0);

  return (
    <div className="max-w-[1120px]">
      <SectionTitle>Chat recordings</SectionTitle>
      <div className="relative mb-3 max-w-md">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recordings…"
          aria-label="Search recordings"
          className="h-8 pl-7 pr-9 text-xs"
        />
        {search && (
          <IconButton
            onClick={() => setSearch("")}
            aria-label="Clear recordings search"
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1"
          >
            <X className="size-3.5" />
          </IconButton>
        )}
      </div>

      <PanelFrame
        loading={loading && !loaded}
        error={error}
        loaded={loaded}
        loadingLabel="Loading recordings…"
        onRefresh={refresh}
      >
        {empty ? (
          <EmptyState
            icon={<Inbox className="size-6" />}
            title={query ? `No recordings match “${query}”.` : RECORDINGS_EMPTY.title}
            hint={query ? "Try fewer or different words." : RECORDINGS_EMPTY.hint}
          />
        ) : data?.kind === "search" ? (
          <Card className="p-0">
            <ul>
              {data.results.map((r, i) => (
                <li
                  key={`${r.session_id}-${i}`}
                  className="border-b border-border/60 px-4 py-3 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(r.session_id)}
                    aria-label={`Open ${title({ title: r.session_title })}`}
                    className="block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="block text-sm font-medium">
                      {title({ title: r.session_title })}
                    </span>
                    <span className="mt-0.5 line-clamp-3 block whitespace-pre-wrap text-xs text-muted-foreground">
                      {r.content}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.key} role="group" aria-label={g.label}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{g.label}</span>
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">
                      {g.recordings.length} {g.recordings.length === 1 ? "recording" : "recordings"}
                    </span>
                  </h3>
                  <IconButton
                    onClick={() => {
                      setDeleteError(null);
                      setPending(g);
                    }}
                    title="Delete this conversation"
                    aria-label={`Delete this conversation in ${g.label}`}
                    className="hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
                <Card className="p-0">
                  <ul>
                    {g.recordings.map((s) => (
                      <li
                        key={s.id}
                        data-slot="row"
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <button
                          type="button"
                          onClick={() => setOpenId(s.id)}
                          aria-label={`Open ${title(s)}`}
                          className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <span className="min-w-0 truncate text-sm">{title(s)}</span>
                          <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                            <span>
                              {s.message_count} {s.message_count === 1 ? "message" : "messages"}
                            </span>
                            <span>·</span>
                            <time
                              dateTime={isoTime(s.last_activity_at ?? s.started_at) ?? undefined}
                              title={absoluteTime(s.last_activity_at ?? s.started_at) ?? undefined}
                            >
                              {relativeTime(s.last_activity_at ?? s.started_at)}
                            </time>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            ))}
          </div>
        )}
      </PanelFrame>

      {/* An older gateway ignores `source` and reports the total of every
          session, so the pager needs a channel row on the page to be believed. */}
      {data?.kind === "list" && groups.length > 0 && total > PAGE_SIZE && (
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
            Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.ceil(total / PAGE_SIZE)}
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
        open={!!pending}
        onClose={() => setPending(null)}
        title="Delete this conversation?"
        description={
          pending ? (
            <>
              {deleteConversationText(pending.label)}
              {deleteError && (
                <span role="alert" className="mt-2 block text-destructive">
                  {deleteError}
                </span>
              )}
            </>
          ) : undefined
        }
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
