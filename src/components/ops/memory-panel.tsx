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
import { IconButton, PanelFrame, RefreshButton, SectionTitle } from "./shared";

const MEMORY_CATEGORIES = ["core", "daily", "conversation"];

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
      await api.addMemory({ content: content.trim(), category });
      toast.success("Fact stored");
      setContent("");
      refresh();
    } catch (e) {
      toast.error(`Store failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
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
        Memory entries {data && <span className="text-muted-foreground">· {data.count}</span>}
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
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs">{e.key}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {e.category}
                    </Badge>
                    <IconButton
                      onClick={() => setPendingForget({ key: e.key, content: e.content })}
                      disabled={w}
                      title="Forget"
                      aria-label="Forget this memory"
                      className="hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      {w ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    </IconButton>
                  </div>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                  {e.content}
                </p>
                <div className="mt-1 text-[10px] text-muted-foreground">{relativeTime(e.timestamp)}</div>
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
