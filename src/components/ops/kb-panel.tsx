"use client";

import * as React from "react";
import {
  Database,
  BookOpen,
  FolderOpen,
  FolderMinus,
  Plus,
  Pencil,
  Trash2,
  Check,
  Loader2,
  ChevronLeft,
  X,
  Search,
  ArrowUpDown,
  LayoutGrid,
  List,
  Network,
  UploadCloud,
  Upload,
  Eye,
  AlertTriangle,
  FileScan,
} from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import {
  acceptAttr,
  imageAcceptAttr,
  ingestFile,
  MAX_BYTES,
} from "@/lib/attachments";
import type { KbDocument, KbGroup } from "@/lib/types";
import {
  DEFAULT_KB_COLOR,
  DEFAULT_KB_PRESET,
  KB_PRESETS,
  SUPPORTED_UPLOADS,
  deleteDocCopy,
  deleteGroupCopy,
  duplicateTitles,
  ingestNote,
  isPreset,
  kbVerdict,
  tileInk,
  unlinkDocCopy,
  type KbVerdict,
} from "@/lib/kb";
import { cn, relativeTime, formatNumber } from "@/lib/utils";
import { getFileTypeIcon, formatFileSize } from "@/lib/file-type";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState, IconButton, PanelFrame, RefreshButton, SectionTitle } from "./shared";
import { DocViewerDrawer } from "./doc-viewer-drawer";
import { GraphLens } from "./graph-lens";
import { KnowledgeSettingsCard, type KnowledgeStatusState } from "./knowledge-settings-card";
import { toast } from "sonner";


type SortOption = "newest" | "oldest" | "name" | "retrieved";
type ViewMode = "grid" | "list";

const errMsg = (e: unknown) => (describeApiError(e));

// ─────────────────────────────────────────────────────────────────────────────

type LibraryView = "documents" | "graph";

export function KbPanel() {
  // Gate on activation BEFORE mounting the library. The library lives in a
  // CHILD component (KbPanelBody) because hooks fire on mount regardless of
  // what is rendered: a `useAsync(kbGroups)` in THIS component would fetch
  // even while the early-return shows only the activation card. Older gateways
  // omit `enabled`; treat configured-as-enabled there.
  const kbStatus = useAsync(() => api.getKnowledge(), []);
  const kbEnabled = kbStatus.data
    ? (kbStatus.data.enabled ?? kbStatus.data.embedding_configured)
    : false;

  if (kbStatus.loading) {
    return (
      <PanelFrame loading loadingLabel="Loading Knowledge Base status…">
        <></>
      </PanelFrame>
    );
  }
  if (!kbEnabled) {
    // The verdict still opens the page; under it, only the activation card.
    return (
      <div className="max-w-[1120px] space-y-8">
        {kbStatus.data && <KbBand verdict={kbVerdict(kbStatus.data, null)} />}
        <div className="max-w-xl">
          <KnowledgeSettingsCard status={kbStatus} />
        </div>
      </div>
    );
  }
  return <KbPanelBody status={kbStatus} />;
}

/**
 * The page opens with the answer: can the agent retrieve, and from what?
 * Not a card; the whitespace around the band marks the focal point, as on
 * Status, Channels, Providers, Schedules and Skills.
 */
function KbBand({ verdict }: { verdict: KbVerdict }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full"
          style={{
            background: verdict.tone === "ok" ? "var(--accent-green)" : "var(--accent-orange)",
          }}
        />
        <p className="text-xl font-medium tracking-tight">{verdict.headline}</p>
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
      {verdict.detail && <p className="mt-1.5 text-xs text-muted-foreground">{verdict.detail}</p>}
    </div>
  );
}

function KbPanelBody({ status }: { status: KnowledgeStatusState }) {
  const groups = useAsync(() => api.kbGroups(), []);
  const [selected, setSelected] = React.useState<KbGroup | null>(null);
  const [view, setView] = React.useState<LibraryView>("documents");
  // Set when a delete removes the element that had focus (a row's Delete, or
  // the detail's), so the list can put focus on something that still exists.
  const focusListRef = React.useRef(false);

  // Keep the selected group's metadata fresh after the list refreshes.
  React.useEffect(() => {
    if (selected && groups.data) {
      const g = groups.data.find((x) => x.id === selected.id);
      if (g && g !== selected) setSelected(g);
      if (!g) setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.data]);

  const refreshAll = () => {
    groups.refresh();
    status.refresh();
  };

  return (
    <div className="max-w-[1120px] space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PanelFrame
            loading={groups.loading}
            error={groups.error}
            loaded={groups.loaded}
            loadingLabel="Loading knowledge bases…"
            onRefresh={groups.refresh}
          >
            {groups.data && status.data && (
              <KbBand verdict={kbVerdict(status.data, groups.data)} />
            )}
          </PanelFrame>
        </div>
        {/* The detail and the graph carry their own refresh; two identical
            Refresh buttons on one screen would race each other for meaning. */}
        {view === "documents" && !selected && (
          <RefreshButton onClick={refreshAll} spinning={groups.refreshing} />
        )}
      </div>

      <Segmented
        value={view}
        onChange={setView}
        options={[
          {
            value: "documents",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="size-4" /> Documents
              </span>
            ),
          },
          {
            value: "graph",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Network className="size-4" /> Graph
              </span>
            ),
          },
        ]}
      />

      {view === "documents" ? (
        selected ? (
          <KbDetail
            group={selected}
            onBack={() => setSelected(null)}
            onChanged={() => groups.refresh()}
            onDeleted={async () => {
              await groups.refresh();
              focusListRef.current = true;
              setSelected(null);
            }}
          />
        ) : (
          groups.data && (
            <KbList groups={groups} status={status} onOpen={setSelected} focusOnMount={focusListRef} />
          )
        )
      ) : (
        <GraphLens scope={selected ? { kind: "group", groupId: selected.id } : { kind: "all" }} />
      )}
    </div>
  );
}

// ── KB list view ──────────────────────────────────────────────────────────────

function KbList({
  groups,
  status,
  onOpen,
  focusOnMount,
}: {
  groups: ReturnType<typeof useAsync<KbGroup[]>>;
  status: KnowledgeStatusState;
  onOpen: (g: KbGroup) => void;
  focusOnMount?: React.MutableRefObject<boolean>;
}) {
  const createNameRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (focusOnMount?.current) {
      focusOnMount.current = false;
      createNameRef.current?.focus();
    }
  }, [focusOnMount]);
  const [editing, setEditing] = React.useState<KbGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<KbGroup | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  // After a delete the confirm's opener is gone with the row. The Modal hands
  // focus back in its own effect cleanup; this effect runs after it in the same
  // flush (React cleans up children before it creates parent effects), so the
  // form's Name field, which is always here, ends up focused.
  const focusNewAfterClose = React.useRef(false);
  React.useEffect(() => {
    if (focusNewAfterClose.current && !deleteTarget) {
      focusNewAfterClose.current = false;
      createNameRef.current?.focus();
    }
  }, [deleteTarget]);

  const list = groups.data ?? [];

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const name = deleteTarget.name;
    try {
      await api.kbDeleteGroup(deleteTarget.id);
      toast.success(`Deleted “${name}”`);
      // Refresh before closing the confirm: its opener (the row's Delete) is
      // gone by the time the Modal tries to hand focus back.
      await groups.refresh();
      focusNewAfterClose.current = true;
      setDeleteTarget(null);
    } catch (e) {
      toast.error(`Delete failed: ${errMsg(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* The 7/5 split gives the list the width to state its facts; creating a
          base and the retrieval key compose in the narrow column. On phones
          the list (the answer) comes first. */}
      <div className="min-w-0 lg:col-span-7">
        <SectionTitle>
          Knowledge bases <span className="text-muted-foreground">· {list.length}</span>
        </SectionTitle>
        {list.length === 0 ? (
          <EmptyState
            icon={<Database className="size-6" />}
            title="No knowledge bases yet."
            hint="Create one with the form beside this list, then upload documents into it."
          />
        ) : (
          <Card className="divide-y divide-border">
            {list.map((g) => (
              <KbRow
                key={g.id}
                group={g}
                onOpen={() => onOpen(g)}
                onEdit={() => setEditing(g)}
                onDelete={() => setDeleteTarget(g)}
              />
            ))}
          </Card>
        )}
      </div>

      <div className="min-w-0 space-y-8 lg:col-span-5">
        <div>
          <SectionTitle>New knowledge base</SectionTitle>
          <p className="text-xs text-muted-foreground">
            A named collection of documents the agent retrieves from. The colour marks it
            here and in the chat picker.
          </p>
          <KbCreateForm
            nameRef={createNameRef}
            onCreated={() => groups.refresh()}
            className="mt-3"
          />
        </div>
        <div>
          <SectionTitle>Retrieval key</SectionTitle>
          <p className="text-xs text-muted-foreground">
            Document search runs on the embedding key; image uploads also need an OCR key.
          </p>
          <div className="mt-3">
            <KnowledgeSettingsCard status={status} />
          </div>
        </div>
      </div>

      <KbEditorModal
        group={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          groups.refresh();
        }}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete knowledge base"
        description={deleteTarget ? deleteGroupCopy(deleteTarget).body : undefined}
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/** One base as a row, cron-style: the colour dot, the name as the row's action,
 *  the count as a quiet fact, the description one line with the full text on
 *  its title. Rows keep their actions visible on every pointer. */
function KbRow({
  group,
  onOpen,
  onEdit,
  onDelete,
}: {
  group: KbGroup;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const docCount = group.document_count ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            aria-hidden
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ background: group.color || DEFAULT_KB_COLOR }}
          />
          <button
            type="button"
            onClick={onOpen}
            title={group.name}
            className="min-w-0 max-w-full cursor-pointer truncate text-left text-sm font-medium transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {group.name}
          </button>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {docCount} doc{docCount === 1 ? "" : "s"}
          </span>
        </div>
        {group.description && (
          <div
            className="mt-0.5 break-words text-xs text-muted-foreground/80 sm:truncate"
            title={group.description}
          >
            {group.description}
          </div>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-0.5 max-sm:basis-full max-sm:justify-end">
        <IconButton onClick={onEdit} title="Edit" aria-label={`Edit knowledge base ${group.name}`}>
          <Pencil className="size-3.5" />
        </IconButton>
        <IconButton
          onClick={onDelete}
          title="Delete"
          aria-label={`Delete knowledge base ${group.name}`}
          className="hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

/** The colour presets as a named radiogroup with arrow keys; a stored colour
 *  outside the set is kept as "Current colour" so an edit never recolours. */
function ColorSwatches({
  value,
  onChange,
  currentColor,
  labelId,
}: {
  value: string;
  onChange: (hex: string) => void;
  currentColor?: string | null;
  labelId: string;
}) {
  const swatches = React.useMemo(() => {
    const list = KB_PRESETS.map((p) => ({ hex: p.hex, name: p.name }));
    if (currentColor && !isPreset(currentColor)) {
      list.unshift({ hex: currentColor, name: "Current colour" });
    }
    return list;
  }, [currentColor]);
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = swatches.findIndex((c) => c.hex === value);
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % swatches.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (i - 1 + swatches.length) % swatches.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = swatches.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(swatches[next].hex);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
      {swatches.map((c, i) => {
        const checked = value === c.hex;
        return (
          <button
            key={c.hex}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={c.name}
            title={c.name}
            tabIndex={checked || (checkedIndex < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(c.hex)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "size-7 cursor-pointer rounded-full pointer-coarse:size-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              checked && "ring-2 ring-ring ring-offset-2 ring-offset-card",
            )}
            style={{ backgroundColor: c.hex }}
          />
        );
      })}
    </div>
  );
}

/** The page's one primary action, composed in the narrow column as on
 *  Schedules: the form is on screen, not behind a button. */
function KbCreateForm({
  nameRef,
  onCreated,
  className,
}: {
  nameRef: React.RefObject<HTMLInputElement | null>;
  onCreated: () => void;
  className?: string;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState(DEFAULT_KB_PRESET);
  const [saving, setSaving] = React.useState(false);
  const nameId = React.useId();
  const descId = React.useId();
  const colorId = React.useId();

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await api.kbCreateGroup({
        name: trimmed,
        description: description.trim() || undefined,
        color,
      });
      toast.success(`Created “${trimmed}”`);
      setName("");
      setDescription("");
      setColor(DEFAULT_KB_PRESET);
      onCreated();
    } catch (e) {
      toast.error(`Create failed: ${errMsg(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={cn("space-y-4 p-4", className)}>
      <div className="space-y-1.5">
        <label htmlFor={nameId} className="eyebrow">
          Name
        </label>
        <Input
          id={nameId}
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Product Docs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) create();
          }}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={descId} className="eyebrow">
          Description
        </label>
        <Textarea
          id={descId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What lives in this knowledge base? (optional)"
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <div id={colorId} className="eyebrow">
          Color
        </div>
        <ColorSwatches value={color} onChange={setColor} labelId={colorId} />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={create} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Create
        </Button>
      </div>
    </Card>
  );
}

function KbEditorModal({
  group,
  onClose,
  onSaved,
}: {
  group: KbGroup | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = !!group;
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState(DEFAULT_KB_PRESET);
  const [saving, setSaving] = React.useState(false);
  const nameId = React.useId();
  const descId = React.useId();
  const colorId = React.useId();

  // Sync the form when the modal opens for a base.
  React.useEffect(() => {
    if (!group) return;
    setName(group.name);
    setDescription(group.description ?? "");
    setColor(group.color ?? DEFAULT_KB_PRESET);
  }, [group]);

  // A stable close handler: the Modal re-runs its first-focus effect whenever
  // `onClose` changes identity, and an inline arrow changed on every keystroke,
  // which yanked focus back to the Name field while typing in Description.
  const handleClose = React.useCallback(() => {
    if (!saving) onClose();
  }, [saving, onClose]);

  const save = async () => {
    if (!group) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.kbUpdateGroup(group.id, {
        name: trimmed,
        description: description.trim(),
        color,
      });
      toast.success("Knowledge base updated");
      onSaved();
    } catch (e) {
      toast.error(`Save failed: ${errMsg(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit knowledge base"
      description="Update the name, description, and color."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor={nameId} className="eyebrow">
            Name
          </label>
          <Input
            id={nameId}
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Product Docs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) save();
            }}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={descId} className="eyebrow">
            Description
          </label>
          <Textarea
            id={descId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What lives in this knowledge base? (optional)"
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <div id={colorId} className="eyebrow">
            Color
          </div>
          <ColorSwatches
            value={color}
            onChange={setColor}
            currentColor={group?.color}
            labelId={colorId}
          />
        </div>
      </div>
    </Modal>
  );
}

// ── KB detail view ────────────────────────────────────────────────────────────

interface UploadEntry {
  id: string;
  name: string;
  status: "uploading" | "ready" | "error";
  error?: string;
  /** The gateway's extraction measurement, once the upload succeeded. */
  note?: string;
  /** The gateway flagged the extraction as thin (it may retrieve poorly). */
  thin?: boolean;
}

function KbDetail({
  group,
  onBack,
  onChanged,
  onDeleted,
}: {
  group: KbGroup;
  onBack: () => void;
  onChanged: () => void;
  /** The base was deleted: the host refreshes, leaves the detail and moves focus. */
  onDeleted: () => void | Promise<void>;
}) {
  const docs = useAsync(() => api.kbGroupDocuments(group.id), [group.id]);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const imageRef = React.useRef<HTMLInputElement>(null);

  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortOption>("newest");
  const [view, setView] = React.useState<ViewMode>("grid");
  const [uploads, setUploads] = React.useState<UploadEntry[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const [working, setWorking] = React.useState<string | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  // Per-document delete confirmation target (deletes the document, not just the link).
  const [deleteDoc, setDeleteDoc] = React.useState<KbDocument | null>(null);
  const [deletingDoc, setDeletingDoc] = React.useState(false);
  // Per-document unlink target (removes from this group only; the document lives on).
  const [unlinkDoc, setUnlinkDoc] = React.useState<KbDocument | null>(null);
  const [unlinking, setUnlinking] = React.useState(false);
  // Per-document viewer drawer target + which tab it opens on (Preview/Intelligence).
  const [viewerDoc, setViewerDoc] = React.useState<KbDocument | null>(null);
  const [viewerTab, setViewerTab] = React.useState<"preview" | "intelligence">("preview");

  const uploading = uploads.some((u) => u.status === "uploading");

  const ts = (v: number | string | null | undefined): number => {
    if (v == null) return 0;
    let n = typeof v === "string" ? Number(v) : v;
    // ISO 8601 strings aren't numeric — parse them to epoch ms.
    if (typeof v === "string" && !Number.isFinite(n)) n = Date.parse(v);
    if (!Number.isFinite(n)) return 0;
    return n < 1e12 ? n * 1000 : n;
  };

  const visible = React.useMemo(() => {
    const all = docs.data ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? all.filter((d) => (d.title || d.id).toLowerCase().includes(q))
      : all.slice();
    filtered.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return ts(a.created_at) - ts(b.created_at);
        case "name":
          return (a.title || a.id).localeCompare(b.title || b.id);
        case "retrieved":
          return (b.retrieval_count ?? 0) - (a.retrieval_count ?? 0);
        case "newest":
        default:
          return ts(b.created_at) - ts(a.created_at);
      }
    });
    return filtered;
  }, [docs.data, search, sort]);

  const upload = async (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;

    // Seed a transient progress row per file.
    const seeded: UploadEntry[] = arr.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      status: "uploading",
    }));
    setUploads((prev) => [...prev, ...seeded]);
    // The gateway titles a document by its file stem and accepts the same
    // stem twice; say so rather than growing a silent second "notes".
    const dupes = duplicateTitles(arr, docs.data ?? []);

    let ok = 0;
    let failed = 0;
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      const entryId = seeded[i].id;
      if (file.size > MAX_BYTES) {
        failed += 1;
        toast.error(`${file.name}: too large (max 20 MB)`);
        setUploads((prev) =>
          prev.map((u) =>
            u.id === entryId ? { ...u, status: "error", error: "too large" } : u,
          ),
        );
        continue;
      }
      try {
        // Link to this group at ingest via the gateway's `groups` field — no
        // separate kbAddDocToGroup round-trip and no UUID category pollution.
        const r = await ingestFile(file, { groups: [group.id] });
        ok += 1;
        const note = ingestNote(r);
        setUploads((prev) =>
          prev.map((u) =>
            u.id === entryId ? { ...u, status: "ready", note: note.text, thin: note.thin } : u,
          ),
        );
        if (note.thin) {
          toast.warning(
            `${file.name} extracted only ${formatNumber(r.chars_extracted)} characters; it may retrieve poorly.`,
          );
        }
      } catch (e) {
        failed += 1;
        const msg = errMsg(e);
        toast.error(`${file.name}: ${msg}`);
        setUploads((prev) =>
          prev.map((u) =>
            u.id === entryId ? { ...u, status: "error", error: msg } : u,
          ),
        );
      }
    }

    if (ok) toast.success(`Added ${ok} document${ok === 1 ? "" : "s"} to “${group.name}”`);
    if (ok && dupes.length) {
      toast.warning(
        `${dupes.map((d) => `“${d}”`).join(", ")} already existed in this knowledge base; added again.`,
      );
    }
    if (ok || failed) {
      docs.refresh();
      onChanged();
    }
    // Clear the plain "ready" rows after a short beat; keep failures and thin
    // extractions on screen, since both ask the operator for a decision.
    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => u.status === "error" || u.thin));
    }, 2500);
  };

  const confirmDeleteDoc = async () => {
    if (!deleteDoc) return;
    const target = deleteDoc;
    setDeletingDoc(true);
    setWorking(target.id);
    try {
      await api.kbDeleteDocument(target.id);
      toast.success(`Deleted “${target.title || target.id.slice(0, 8)}”`);
      setDeleteDoc(null);
      docs.refresh();
      onChanged();
    } catch (e) {
      toast.error(`Delete failed: ${errMsg(e)}`);
    } finally {
      setDeletingDoc(false);
      setWorking(null);
    }
  };

  const confirmUnlinkDoc = async () => {
    if (!unlinkDoc) return;
    const target = unlinkDoc;
    setUnlinking(true);
    setWorking(target.id);
    try {
      await api.kbRemoveDocFromGroup(group.id, target.id);
      toast.success(`Removed “${target.title || target.id.slice(0, 8)}” from “${group.name}”`);
      setUnlinkDoc(null);
      docs.refresh();
      onChanged();
    } catch (e) {
      toast.error(`Remove failed: ${errMsg(e)}`);
    } finally {
      setUnlinking(false);
      setWorking(null);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.kbDeleteGroup(group.id);
      toast.success(`Deleted “${group.name}”`);
      await onDeleted();
    } catch (e) {
      toast.error(`Delete failed: ${errMsg(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  // Server count first (correct since RantAIClaw plan 100 — soft-deleted
  // excluded): preferring the locally-fetched list length quietly hid a
  // server-side divergence instead of revealing it (plan 111).
  const docCount = group.document_count ?? docs.data?.length ?? 0;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
      >
        <ChevronLeft className="size-4" /> All knowledge bases
      </button>

      {/* KB header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: group.color || DEFAULT_KB_COLOR, color: tileInk(group.color) }}
            aria-hidden
          >
            <FolderOpen className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 title={group.name} className="truncate text-lg font-semibold tracking-tight">
                {group.name}
              </h3>
              <Badge variant="secondary" className="text-[10px]">
                {docCount} doc{docCount === 1 ? "" : "s"}
              </Badge>
            </div>
            {group.description && (
              <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
                {group.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <RefreshButton onClick={docs.refresh} spinning={docs.refreshing} />
          <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            title="Delete knowledge base"
            aria-label="Delete knowledge base"
            onClick={() => setDeleteOpen(true)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Upload dropzone */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={acceptAttr()}
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={imageRef}
        type="file"
        multiple
        accept={imageAcceptAttr()}
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
      {/* The 7/5 split: the documents (the answer) take the width; adding
          documents composes in the narrow column. On phones the documents
          come first. */}
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <SectionTitle>
            Documents <span className="text-muted-foreground">· {docCount}</span>
          </SectionTitle>

          {/* Toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search documents"
                placeholder="Search documents…"
                className="pl-8"
              />
            </div>
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                aria-label="Sort documents"
                className="pl-8 pr-7"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name A–Z</option>
                <option value="retrieved">Most retrieved</option>
              </Select>
            </div>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "grid", label: <LayoutGrid className="size-4" />, ariaLabel: "Grid view" },
                { value: "list", label: <List className="size-4" />, ariaLabel: "List view" },
              ]}
            />
          </div>

          {/* Documents */}
          <PanelFrame
            loading={docs.loading}
            error={docs.error}
            loaded={docs.loaded}
            onRefresh={docs.refresh}
            loadingLabel="Loading documents…"
          >
            {visible.length === 0 ? (
              <DocsEmpty
                query={search.trim()}
                total={(docs.data ?? []).length}
                onUpload={() => fileRef.current?.click()}
              />
            ) : view === "grid" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {visible.map((d) => (
                  <DocCard
                    key={d.id}
                    doc={d}
                    busy={working === d.id}
                    onDelete={() => setDeleteDoc(d)}
                    onUnlink={() => setUnlinkDoc(d)}
                    onView={() => {
                      setViewerDoc(d);
                      setViewerTab("preview");
                    }}
                    onIntel={() => {
                      setViewerDoc(d);
                      setViewerTab("intelligence");
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                {visible.map((d) => (
                  <DocRow
                    key={d.id}
                    doc={d}
                    busy={working === d.id}
                    onDelete={() => setDeleteDoc(d)}
                    onUnlink={() => setUnlinkDoc(d)}
                    onView={() => {
                      setViewerDoc(d);
                      setViewerTab("preview");
                    }}
                    onIntel={() => {
                      setViewerDoc(d);
                      setViewerTab("intelligence");
                    }}
                  />
                ))}
              </div>
            )}
          </PanelFrame>
        </div>

        <div className="min-w-0 lg:col-span-5">
          <SectionTitle>Add documents</SectionTitle>
          {/* Drop target. The outer div only catches drag and drop; the control
              is a real button, so Enter and Space do exactly one thing and no
              wrapper key handler can swallow the sibling button's activation. */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void upload(e.dataTransfer.files);
            }}
            className={cn(
              "rounded-xl border-2 border-dashed px-4 py-4 text-center transition-colors",
              dragOver ? "border-accent bg-accent/5" : "border-border bg-muted/30",
            )}
          >
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50"
            >
              <UploadCloud
                className={cn("size-7 max-sm:hidden", dragOver ? "text-accent" : "text-muted-foreground")}
                aria-hidden
              />
              <span className="text-sm font-medium">
                Drop files here or <span className="text-accent">choose documents</span>
              </span>
              <span className="text-[11px] text-muted-foreground max-sm:hidden">
                {SUPPORTED_UPLOADS} · max 20 MB · added to “{group.name}”
              </span>
            </button>
            <div className="mt-2 flex justify-center">
              <Button
                size="sm"
                variant="outline"
                onClick={() => imageRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="size-3.5" /> Upload images instead
              </Button>
            </div>
          </div>

          {/* Transient per-file upload progress */}
          {uploads.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {uploads.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"
                >
                  {u.status === "uploading" && (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                  )}
                  {u.status === "ready" && u.thin && (
                    <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                  )}
                  {u.status === "ready" && !u.thin && (
                    <Check className="size-3.5 shrink-0 text-success" />
                  )}
                  {u.status === "error" && (
                    <X className="size-3.5 shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                  <span
                    className={cn(
                      "min-w-0",
                      u.status === "error" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {u.status === "uploading"
                      ? "uploading…"
                      : u.status === "ready"
                        ? (u.note ?? "ready")
                        : u.error || "failed"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <KbEditorModal
        group={editorOpen ? group : null}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          setEditorOpen(false);
          onChanged();
        }}
      />

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete knowledge base"
        description={deleteGroupCopy(group).body}
        busy={deleting}
        onConfirm={confirmDelete}
      />

      <ConfirmModal
        open={!!unlinkDoc}
        onClose={() => setUnlinkDoc(null)}
        title="Remove from this knowledge base"
        description={
          unlinkDoc ? unlinkDocCopy(unlinkDoc.title || unlinkDoc.id.slice(0, 8), group.name) : ""
        }
        confirmLabel="Remove"
        busy={unlinking}
        onConfirm={confirmUnlinkDoc}
      />

      <ConfirmModal
        open={!!deleteDoc}
        onClose={() => setDeleteDoc(null)}
        title="Delete document"
        description={deleteDoc ? deleteDocCopy(deleteDoc.title || deleteDoc.id.slice(0, 8)) : ""}
        busy={deletingDoc}
        onConfirm={confirmDeleteDoc}
      />

      {viewerDoc && (
        <DocViewerDrawer
          documentId={viewerDoc.id}
          documentTitle={viewerDoc.title || viewerDoc.id.slice(0, 8)}
          initialTab={viewerTab}
          onClose={() => setViewerDoc(null)}
        />
      )}
    </div>
  );
}

function DocsEmpty({
  query,
  total,
  onUpload,
}: {
  query: string;
  total: number;
  onUpload: () => void;
}) {
  const searching = query.length > 0;
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20">
      <EmptyState
        icon={<BookOpen className="size-6" />}
        title={searching ? `No documents match “${query}”.` : "No documents yet"}
        hint={
          searching
            ? `Clear the search to see all ${formatNumber(total)} document${total === 1 ? "" : "s"}.`
            : "Upload files above to add them to this knowledge base."
        }
        action={
          !searching && (
            <Button size="sm" variant="outline" onClick={onUpload}>
              <Upload className="size-3.5" /> Upload documents
            </Button>
          )
        }
      />
    </div>
  );
}

/** The View / Intelligence / Remove / Delete icon cluster shared by DocCard and DocRow. */
function DocActions({
  busy,
  onView,
  onIntel,
  onUnlink,
  onDelete,
  buttonClassName,
}: {
  busy: boolean;
  onView: () => void;
  onIntel: () => void;
  onUnlink: () => void;
  onDelete: () => void;
  buttonClassName?: string;
}) {
  return (
    <>
      <IconButton
        onClick={onView}
        title="View document"
        aria-label="View document"
        className={cn(buttonClassName, "hover:bg-accent/10 hover:text-accent")}
      >
        <Eye className="size-3.5" />
      </IconButton>
      <IconButton
        onClick={onIntel}
        title="Document intelligence"
        aria-label="Document intelligence"
        className={cn(buttonClassName, "hover:bg-accent/10 hover:text-accent")}
      >
        <FileScan className="size-3.5" />
      </IconButton>
      <IconButton
        onClick={onUnlink}
        disabled={busy}
        title="Remove from this knowledge base"
        aria-label="Remove from this knowledge base"
        className={buttonClassName}
      >
        <FolderMinus className="size-3.5" />
      </IconButton>
      <IconButton
        onClick={onDelete}
        disabled={busy}
        title="Delete document"
        aria-label="Delete document"
        className={cn(buttonClassName, "hover:bg-destructive/10 hover:text-destructive")}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </IconButton>
    </>
  );
}

function DocCard({
  doc,
  busy,
  onDelete,
  onUnlink,
  onView,
  onIntel,
}: {
  doc: KbDocument;
  busy: boolean;
  onDelete: () => void;
  onUnlink: () => void;
  onView: () => void;
  onIntel: () => void;
}) {
  const { Icon, iconColor, bgColor } = getFileTypeIcon(doc.file_type);
  const retrievals = doc.retrieval_count ?? 0;
  const meta = [formatFileSize(doc.file_size), doc.file_type]
    .filter((x) => x && x !== "—")
    .join(" · ");

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-3 transition-colors hover:border-accent/40 focus-within:border-accent/40">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <DocActions
          busy={busy}
          onView={onView}
          onIntel={onIntel}
          onUnlink={onUnlink}
          onDelete={onDelete}
          buttonClassName="bg-background/90"
        />
      </div>

      <div className="flex flex-col items-center gap-2.5 py-2">
        <div className={cn("rounded-xl p-3", bgColor)} aria-hidden>
          <Icon className={cn("size-8", iconColor)} />
        </div>
        <p
          title={doc.title || doc.id.slice(0, 8)}
          className="line-clamp-2 px-1 text-center text-sm font-medium leading-snug"
        >
          {doc.title || doc.id.slice(0, 8)}
        </p>
      </div>

      <div className="mt-1 flex flex-col items-center gap-1.5 border-t border-border/50 pt-2.5">
        {meta && (
          <p title={meta} className="truncate text-[11px] text-muted-foreground">
            {meta}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          {retrievals > 0 && (
            <Badge variant="accent" className="text-[10px]">
              {formatNumber(retrievals)} retrieval{retrievals === 1 ? "" : "s"}
            </Badge>
          )}
          {doc.created_at != null && (
            <span className="text-[10px] text-muted-foreground">
              {relativeTime(doc.created_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DocRow({
  doc,
  busy,
  onDelete,
  onUnlink,
  onView,
  onIntel,
}: {
  doc: KbDocument;
  busy: boolean;
  onDelete: () => void;
  onUnlink: () => void;
  onView: () => void;
  onIntel: () => void;
}) {
  const { Icon, iconColor, bgColor } = getFileTypeIcon(doc.file_type);
  const retrievals = doc.retrieval_count ?? 0;
  const meta = [formatFileSize(doc.file_size), doc.file_type, relativeTime(doc.created_at)]
    .filter((x) => x && x !== "—")
    .join(" · ");

  return (
    <div className="group flex items-center gap-3 border-b border-border/60 bg-card px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/40">
      <div className={cn("shrink-0 rounded-lg p-1.5", bgColor)} aria-hidden>
        <Icon className={cn("size-4", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <div title={doc.title || doc.id.slice(0, 8)} className="truncate text-sm font-medium">
          {doc.title || doc.id.slice(0, 8)}
        </div>
        {meta && (
          <div className="truncate text-[11px] text-muted-foreground">{meta}</div>
        )}
      </div>
      {retrievals > 0 && (
        <Badge variant="accent" className="shrink-0 text-[10px]">
          {formatNumber(retrievals)} retrieval{retrievals === 1 ? "" : "s"}
        </Badge>
      )}
      <DocActions
        busy={busy}
        onView={onView}
        onIntel={onIntel}
        onUnlink={onUnlink}
        onDelete={onDelete}
        buttonClassName="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
      />
    </div>
  );
}
