"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmModal } from "@/components/ui/confirm-modal";

/**
 * Knowledge Base credentials card. Doubles as the "not configured" gate:
 * prominent with an input when no key resolves; a compact status row when
 * configured. Consumes GET/PUT /api/rc/config/knowledge. The key value is
 * never returned by the backend — this card only ever shows booleans + source.
 */
export function KnowledgeSettingsCard() {
  const status = useAsync(() => api.getKnowledge(), []);
  const [editing, setEditing] = React.useState(false);
  const [embedding, setEmbedding] = React.useState("");
  const [vision, setVision] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);

  const configured = status.data?.embedding_configured ?? false;
  const source = status.data?.source ?? "none";

  const save = async () => {
    const emb = embedding.trim();
    if (!emb && !configured) return;
    setBusy(true);
    try {
      const body: { embedding_api_key?: string; vision_api_key?: string } = {};
      if (emb) body.embedding_api_key = emb;
      if (vision.trim()) body.vision_api_key = vision.trim();
      await api.setKnowledge(body);
      toast.success("Knowledge Base configured");
      setEmbedding("");
      setVision("");
      setEditing(false);
      status.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await api.setKnowledge({ embedding_api_key: "", vision_api_key: "" });
      toast.success("Knowledge Base keys cleared");
      setConfirmClear(false);
      status.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (status.loading || status.error) return null;

  if (configured && !editing) {
    const envManaged = source === "env";
    return (
      <>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2 text-sm">
          <BookOpen className="size-4 text-muted-foreground" />
          <span className="font-medium">Knowledge Base configured</span>
          <Badge variant="outline">source: {source}</Badge>
          {status.data?.vision_configured && <Badge variant="outline">OCR on</Badge>}
        </div>
        {envManaged ? (
          <span className="text-xs text-muted-foreground">
            Managed by <code>KB_EMBEDDING_API_KEY</code> — unset it to manage the key here.
          </span>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit key</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)} disabled={busy}>Clear</Button>
          </div>
        )}
      </Card>
      <ConfirmModal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear Knowledge Base keys?"
        description="Document search will stop working until you re-enter an embedding key."
        confirmLabel="Clear keys"
        busy={busy}
        onConfirm={clear}
      />
      </>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="size-4" /> Knowledge Base — add an API key
        </div>
        <p className="text-xs text-muted-foreground">
          Document search needs an embedding API key. Optionally add a separate OCR/vision key
          (defaults to the embedding key). Stored encrypted; env <code>KB_EMBEDDING_API_KEY</code>{" "}
          still overrides.
        </p>
      </div>
      <Input
        type="password"
        placeholder="Embedding API key (OpenRouter)"
        autoComplete="off"
        value={embedding}
        onChange={(e) => setEmbedding(e.target.value)}
      />
      <Input
        type="password"
        placeholder="OCR / vision key (optional — leave blank to reuse embedding key)"
        autoComplete="off"
        value={vision}
        onChange={(e) => setVision(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy || (!embedding.trim() && !configured)}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {editing && (
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEmbedding(""); setVision(""); }}>
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
}
