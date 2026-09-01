"use client";

import * as React from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, describeApiError } from "@/lib/api";
import type { useAsync } from "@/hooks/use-async";
import type { KnowledgeStatus } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmModal } from "@/components/ui/confirm-modal";

/**
 * Knowledge Base activation screen + status row (RantAIClaw plan 106).
 *
 * Three states, driven by `enabled` × `embedding_configured`:
 * - off + no key   → "Activate Knowledge Base": key inputs + Activate
 * - off + key      → "Knowledge Base is off": one-click Activate (key kept)
 * - on  + key      → compact status row + Deactivate / Edit / Remove key
 *
 * Deactivate is NOT Clear: it sends `{enabled:false}` and keeps the key so
 * re-activation is one click. The destructive Remove key stays behind its
 * confirm modal. A key the provider rejects (the gateway probes it live and
 * answers 400) surfaces INLINE on the input: a rejected key is a form
 * error, not a toast.
 *
 * The status is owned by `KbPanel` (which gates the library on it) and handed
 * down, so `/config/knowledge` is requested once per mount, not twice.
 */
export type KnowledgeStatusState = ReturnType<typeof useAsync<KnowledgeStatus>>;

export function KnowledgeSettingsCard({
  status,
  onChanged,
}: {
  status: KnowledgeStatusState;
  onChanged?: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [embedding, setEmbedding] = React.useState("");
  const [vision, setVision] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const configured = status.data?.embedding_configured ?? false;
  // Older gateways omit `enabled`; treat configured-as-enabled there so the
  // console keeps working against them (pre-v0.18.5 behaviour).
  const enabled = status.data?.enabled ?? configured;
  const source = status.data?.source ?? "none";
  const envManaged = source === "env";

  const refreshAll = () => {
    status.refresh();
    onChanged?.();
  };

  const put = async (
    body: { enabled?: boolean; embedding_api_key?: string; vision_api_key?: string },
    okMessage: string,
  ): Promise<boolean> => {
    setBusy(true);
    setFormError(null);
    try {
      await api.setKnowledge(body);
      toast.success(okMessage);
      return true;
    } catch (e) {
      const msg = describeApiError(e);
      // The gateway probes the key before persisting; its 400 belongs on
      // the form, not (only) in a toast.
      if (body.embedding_api_key) setFormError(msg);
      else toast.error(msg);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const typedEmb = embedding.trim();
  const typedVis = vision.trim();
  // Activating needs an embedding key (typed now, or already stored); editing
  // needs something typed, or Save would send nothing and still claim a change.
  const canSubmit = editing ? !!(typedEmb || typedVis) : !!typedEmb || configured;

  const saveAndActivate = async () => {
    if (!canSubmit) return;
    const body: { enabled?: boolean; embedding_api_key?: string; vision_api_key?: string } = {};
    if (!editing) body.enabled = true;
    if (typedEmb) body.embedding_api_key = typedEmb;
    if (typedVis) body.vision_api_key = typedVis;
    const okMessage = !editing
      ? "Knowledge Base activated"
      : typedEmb && typedVis
        ? "Embedding and OCR keys updated"
        : typedEmb
          ? "Embedding key updated"
          : "OCR key updated";
    if (await put(body, okMessage)) {
      setEmbedding("");
      setVision("");
      setEditing(false);
      refreshAll();
    }
  };

  const setEnabled = async (next: boolean) => {
    const ok = await put(
      { enabled: next },
      next ? "Knowledge Base activated" : "Knowledge Base deactivated. The key is kept.",
    );
    if (ok) refreshAll();
  };

  const clear = async () => {
    const ok = await put(
      { enabled: false, embedding_api_key: "", vision_api_key: "" },
      "Knowledge Base keys removed",
    );
    setConfirmClear(false);
    if (ok) refreshAll();
  };

  if (status.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading Knowledge Base status…
      </div>
    );
  }

  // Never silently vanish on error — that hides the only place to enter an
  // embedding key. Surface it with a retry instead.
  if (status.error) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <BookOpen className="size-4 text-muted-foreground" />
          <span className="font-medium">Couldn&apos;t load Knowledge Base settings</span>
          <span className="truncate text-xs text-muted-foreground">{status.error}</span>
        </div>
        <Button size="sm" variant="outline" onClick={status.refresh}>
          Retry
        </Button>
      </Card>
    );
  }

  // State: configured but off — one-click reactivation, key retained.
  if (!enabled && configured && !editing) {
    return (
      <>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 text-sm">
            <BookOpen className="size-4 text-muted-foreground" />
            <span className="font-medium">Knowledge Base is off</span>
            <Badge variant="outline">key stored</Badge>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setEnabled(true)} disabled={busy}>
              {busy ? "…" : "Activate"}
            </Button>
            {!envManaged && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmClear(true)}
                disabled={busy}
              >
                Remove key
              </Button>
            )}
          </div>
        </Card>
        <ConfirmModal
          open={confirmClear}
          onClose={() => setConfirmClear(false)}
          title="Remove Knowledge Base keys?"
          description="Permanently removes the stored keys. You will have to re-enter one to activate again. To pause the Knowledge Base without losing the key, use Deactivate instead."
          confirmLabel="Remove keys"
          busy={busy}
          onConfirm={clear}
        />
      </>
    );
  }

  // State: on + configured — compact status row.
  if (enabled && configured && !editing) {
    return (
      <>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-2 text-sm">
            <BookOpen className="size-4 text-muted-foreground" />
            <span className="font-medium">Knowledge Base active</span>
            <Badge variant="outline">source: {source}</Badge>
            {status.data?.vision_configured && <Badge variant="outline">OCR on</Badge>}
          </div>
          {envManaged ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Key managed by <code>KB_EMBEDDING_API_KEY</code>. Unset it to manage the key here.
              </span>
              <Button size="sm" variant="outline" onClick={() => setEnabled(false)} disabled={busy}>
                Deactivate
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEnabled(false)} disabled={busy}>
                Deactivate
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit key
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmClear(true)}
                disabled={busy}
              >
                Remove key
              </Button>
            </div>
          )}
        </Card>
        <ConfirmModal
          open={confirmClear}
          onClose={() => setConfirmClear(false)}
          title="Remove Knowledge Base keys?"
          description="Permanently removes the stored keys. You will have to re-enter one to activate again. To pause the Knowledge Base without losing the key, use Deactivate instead."
          confirmLabel="Remove keys"
          busy={busy}
          onConfirm={clear}
        />
      </>
    );
  }

  // State: activation form — no key yet (or editing an existing one).
  return (
    <Card className="space-y-3 p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="size-4" />{" "}
          {editing ? "Edit Knowledge Base key" : "Activate Knowledge Base"}
        </div>
        <p className="text-xs text-muted-foreground">
          Document search needs an embedding API key. Image uploads also need an OCR / vision
          key. Both are stored encrypted; env <code>KB_EMBEDDING_API_KEY</code> still overrides.
          The key is verified with the provider before it is saved.
        </p>
      </div>
      <Input
        type="password"
        placeholder="Embedding API key (OpenRouter)"
        aria-label="Embedding API key"
        autoComplete="off"
        value={embedding}
        aria-invalid={formError ? true : undefined}
        onChange={(e) => {
          setEmbedding(e.target.value);
          setFormError(null);
        }}
      />
      {formError && <p className="text-xs text-destructive">{formError}</p>}
      <Input
        type="password"
        placeholder="OCR / vision key (needed for image uploads)"
        aria-label="OCR / vision key"
        autoComplete="off"
        value={vision}
        onChange={(e) => setVision(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={saveAndActivate}
          disabled={busy || !canSubmit}
        >
          {busy ? "Verifying…" : editing ? "Save" : "Activate"}
        </Button>
        {editing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setEmbedding("");
              setVision("");
              setFormError(null);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
}
