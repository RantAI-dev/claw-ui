"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { relativeTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { toast } from "sonner";
import { MEMORY_CATEGORIES } from "@/lib/types";
import { IconButton, PanelFrame, RefreshButton, SectionTitle } from "./shared";


/** Keys the server generates when the caller supplied none. */
function isGeneratedKey(key: string): boolean {
  return /^memory_[0-9a-f-]{36}$/i.test(key);
}

/** Enough of a memory to tell one row from another in a label. */
function previewOf(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 48 ? `${flat.slice(0, 48)}…` : flat;
}

export function MemoryPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.memory(100), []);
  const [content, setContent] = React.useState("");
  const [category, setCategory] = React.useState("core");
  const [busy, setBusy] = React.useState(false);
  const [working, setWorking] = React.useState<string | null>(null);
  const [pendingForget, setPendingForget] = React.useState<{ key: string; content: string } | null>(
    null,
  );

  const add = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      const stored = await api.addMemory({ content: content.trim(), category });
      // The server generates a key when none is given; showing it is what makes
      // the entry addressable afterwards.
      toast.success(
        stored.notes?.length
          ? `Stored as ${stored.key} — ${stored.notes.join("; ")}`
          : `Stored as ${stored.key}`,
      );
      setContent("");
      refresh();
    } catch (e) {
      toast.error(`Store failed: ${e instanceof Error ? e.message : e}`);
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

  const del = async () => {
    const key = pendingForget?.key;
    if (!key) return;
    setWorking(key);
    try {
      await api.deleteMemory(key);
      toast.success("Fact forgotten");
      setPendingForget(null);
      refresh();
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle action={<RefreshButton onClick={refresh} />}>
        Memory entries
        {data && (
          <span className="text-muted-foreground">
            {" · "}
            {data.count}
            {data.total > data.count ? ` of ${data.total}` : ""}
          </span>
        )}
      </SectionTitle>

      <Card className="space-y-2 p-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Store a fact
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="A durable fact or preference the agent should remember…"
          rows={2}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 font-mono text-xs"
          >
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={add} disabled={busy || !content.trim()}>
            <Plus className="size-4" /> Store
          </Button>
        </div>
      </Card>

      <PanelFrame loading={loading} error={error} empty={data?.count === 0} onRefresh={refresh}>
        <div className="space-y-2">
          {data?.entries.map((e, idx) => {
            const w = working === e.key;
            return (
              <Card key={`${e.key}-${idx}`} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-snug line-clamp-3">
                    {e.content}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
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
                    className="min-w-0 truncate font-mono transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
                  >
                    {isGeneratedKey(e.key) ? "copy key" : e.key}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      </PanelFrame>

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
        onConfirm={del}
      />
    </div>
  );
}
