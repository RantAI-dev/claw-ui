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
  Sparkles,
  Eye,
  AlertTriangle,
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
  SUPPORTED_UPLOADS,
  countLine,
  deleteDocCopy,
  deleteGroupCopy,
  duplicateTitles,
  ingestNote,
  unlinkDocCopy,
} from "@/lib/kb";
import { cn, relativeTime, formatNumber } from "@/lib/utils";
import { getFileTypeIcon, formatFileSize } from "@/lib/file-type";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState, IconButton, PanelFrame, RefreshButton } from "./shared";
import { DocViewerDrawer } from "./doc-viewer-drawer";
import { GraphLens } from "./graph-lens";
import { KnowledgeSettingsCard, type KnowledgeStatusState } from "./knowledge-settings-card";
import { toast } from "sonner";

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

const DEFAULT_KB_COLOR = "var(--brand-sky)";
/** Names for the swatches, by index; a hex is not a name a screen reader can say. */
const PRESET_NAMES = ["Red", "Orange", "Yellow", "Green", "Cyan", "Blue", "Violet", "Pink"];

type SortOption = "newest" | "oldest" | "name" | "retrieved";
type ViewMode = "grid" | "list";

const errMsg = (e: unknown) => (describeApiError(e));

// ─────────────────────────────────────────────────────────────────────────────

type LibraryView = "documents" | "graph";

export function KbPanel() {
  // Gate on activation BEFORE mounting the library. The library lives in a
  // CHILD component (KbPanelBody) because hooks fire on mount regardless of
  // what is rendered — a `useAsync(kbGroups)` in THIS component would fetch
  // even while the early-return shows only the activation card. Caught by
  // the live browser drive: the render was gated but the request was not
  // (plan 106 requires no kb/groups call while off). Older gateways omit
  // `enabled`; treat configured-as-enabled there.
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
    // Activation screen only: no Documents/Graph chrome, no doomed fetches.
    return <KnowledgeSettingsCard status={kbStatus} />;
  }
  return <KbPanelBody status={kbStatus} />;
}

function KbPanelBody({ status }: { status: KnowledgeStatusState }) {
  const groups = useAsync(() => api.kbGroups(), []);
  const [selected, setSelected] = React.useState<KbGroup | null>(null);
  const [view, setView] = React.useState<LibraryView>("documents");
  // Set when a delete removes the element that had focus (a card's Delete, or
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

  return (
    <div className="space-y-4">
      <KnowledgeSettingsCard status={status} />

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
          <KbList groups={groups} onOpen={setSelected} focusOnMount={focusListRef} />
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
  onOpen,
  focusOnMount,
}: {
  groups: ReturnType<typeof useAsync<KbGroup[]>>;
  onOpen: (g: KbGroup) => void;
  focusOnMount?: React.MutableRefObject<boolean>;
}) {
  const newButtonRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (focusOnMount?.current) {
      focusOnMount.current = false;
      newButtonRef.current?.focus();
    }
  }, [focusOnMount]);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<KbGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<KbGroup | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  // After a delete the confirm's opener is gone with the card. The Modal hands
  // focus back in its own effect cleanup; this effect runs after it in the same
  // flush (React cleans up children before it creates parent effects), so the
  // one control still here ends up focused.
  const focusNewAfterClose = React.useRef(false);
  React.useEffect(() => {
    if (focusNewAfterClose.current && !deleteTarget) {
      focusNewAfterClose.current = false;
      newButtonRef.current?.focus();
    }
  }, [deleteTarget]);

  const list = groups.data ?? [];
  const totalDocs = list.reduce((sum, g) => sum + (g.document_count ?? 0), 0);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (g: KbGroup) => {
    setEditing(g);
    setEditorOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const name = deleteTarget.name;
    try {
      await api.kbDeleteGroup(deleteTarget.id);
      toast.success(`Deleted “${name}”`);
      // Refresh before closing the confirm: its opener (the card's Delete) is
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
    <div className="space-y-4">
      {/* Header: the page title comes from the ops header; this row is the count + actions.
          The count waits for the list: "0 knowledge bases" before the data was a number
          nobody had computed. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="eyebrow">{groups.loaded ? countLine(list.length, totalDocs) : ""}</span>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={groups.refresh} spinning={groups.refreshing} />
          <Button ref={newButtonRef} size="sm" onClick={openCreate}>
            <Plus className="size-4" /> New knowledge base
          </Button>
        </div>
      </div>

      <PanelFrame
        loading={groups.loading}
        error={groups.error}
        loaded={groups.loaded}
        onRefresh={groups.refresh}
        loadingLabel="Loading knowledge bases…"
      >
        {list.length === 0 ? (
          <EmptyState
            icon={<Database className="size-6" />}
            title="No knowledge bases yet"
            hint="A knowledge base is a group of documents the agent can retrieve from."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" /> New knowledge base
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((g) => (
              <KbCard
                key={g.id}
                group={g}
                onOpen={() => onOpen(g)}
                onEdit={() => openEdit(g)}
                onDelete={() => setDeleteTarget(g)}
              />
            ))}
          </div>
        )}
      </PanelFrame>

      <KbEditorModal
        open={editorOpen}
        group={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          setEditorOpen(false);
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

function KbCard({
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
  // A card that is itself a button cannot hold buttons: Enter on its Edit used
  // to open the base and cancel the editor. The name is the button, stretched
  // over the card by its ::after; the actions are siblings layered above it,
  // and they exist on every pointer (a phone has no hover).
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-within:border-accent/40">
      <div className="flex items-start gap-3">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-lg shadow-sm"
          style={{ backgroundColor: group.color || DEFAULT_KB_COLOR }}
          aria-hidden
        >
          <FolderOpen className="size-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 pr-16">
            <button
              type="button"
              onClick={onOpen}
              title={group.name}
              className="min-w-0 cursor-pointer truncate text-left text-sm font-semibold after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {group.name}
            </button>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {docCount} doc{docCount === 1 ? "" : "s"}
            </Badge>
          </div>
          {group.description ? (
            <p
              title={group.description}
              className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground"
            >
              {group.description}
            </p>
          ) : (
            <p className="mt-1 text-xs italic text-muted-foreground/60">No description</p>
          )}
        </div>
      </div>

      {/* After the content in the DOM so Tab reads name, then actions; the
          absolute position keeps them at the top-right. */}
      <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <IconButton
          onClick={onEdit}
          title="Edit"
          aria-label={`Edit knowledge base ${group.name}`}
          className="bg-background/80 shadow-sm backdrop-blur-sm"
        >
          <Pencil className="size-3.5" />
        </IconButton>
        <IconButton
          onClick={onDelete}
          title="Delete"
          aria-label={`Delete knowledge base ${group.name}`}
          className="bg-background/80 shadow-sm backdrop-blur-sm hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

function KbEditorModal({
  open,
  group,
  onClose,
  onSaved,
}: {
  open: boolean;
  group: KbGroup | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState(PRESET_COLORS[5]);
  const [saving, setSaving] = React.useState(false);
  const nameId = React.useId();
  const descId = React.useId();
  const colorId = React.useId();

  // The swatches, plus the stored colour first when it is not one of them, so
  // editing never silently recolours a base.
  const swatches = React.useMemo(() => {
    const list = PRESET_COLORS.map((hex, i) => ({ hex, name: PRESET_NAMES[i] ?? hex }));
    if (group?.color && !PRESET_COLORS.includes(group.color)) {
      list.unshift({ hex: group.color, name: "Current colour" });
    }
    return list;
  }, [group?.color]);
  const swatchRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = swatches.findIndex((c) => c.hex === color);
  const onSwatchKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % swatches.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + swatches.length) % swatches.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = swatches.length - 1;
    if (next === null) return;
    e.preventDefault();
    setColor(swatches[next].hex);
    swatchRefs.current[next]?.focus();
  };

  // Sync form when the modal opens for a (new or existing) KB.
  React.useEffect(() => {
    if (!open) return;
    setName(group?.name ?? "");
    setDescription(group?.description ?? "");
    setColor(
      group?.color ??
        PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
    );
  }, [open, group]);

  // A stable close handler: the Modal re-runs its first-focus effect whenever
  // `onClose` changes identity, and an inline arrow changed on every keystroke,
  // which yanked focus back to the Name field while typing in Description.
  const handleClose = React.useCallback(() => {
    if (!saving) onClose();
  }, [saving, onClose]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (group) {
        await api.kbUpdateGroup(group.id, {
          name: trimmed,
          description: description.trim(),
          color,
        });
        toast.success("Knowledge base updated");
      } else {
        await api.kbCreateGroup({
          name: trimmed,
          description: description.trim() || undefined,
          color,
        });
        toast.success(`Created “${trimmed}”`);
      }
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
      title={group ? "Edit knowledge base" : "New knowledge base"}
      description={
        group
          ? "Update the name, description, and color."
          : "Group related documents the agent can retrieve from."
      }
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
            {group ? "Save changes" : "Create"}
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
          <div role="radiogroup" aria-labelledby={colorId} className="flex flex-wrap gap-2">
            {swatches.map((c, i) => {
              const checked = color === c.hex;
              return (
                <button
                  key={c.hex}
                  ref={(el) => {
                    swatchRefs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={c.name}
                  title={c.name}
                  tabIndex={checked || (checkedIndex < 0 && i === 0) ? 0 : -1}
                  onClick={() => setColor(c.hex)}
                  onKeyDown={(e) => onSwatchKey(e, i)}
                  className={cn(
                    "size-7 cursor-pointer rounded-full pointer-coarse:size-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    checked && "ring-2 ring-ring ring-offset-2 ring-offset-card",
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              );
            })}
          </div>
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
            className="flex size-11 shrink-0 items-center justify-center rounded-lg shadow-sm"
            style={{ backgroundColor: group.color || DEFAULT_KB_COLOR }}
            aria-hidden
          >
            <FolderOpen className="size-5 text-white" />
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
      {/* Drop target. The outer div only catches drag and drop; the control is a
          real button, so Enter and Space do exactly one thing and no wrapper key
          handler can swallow the sibling "Upload images" button's activation. */}
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
          "rounded-xl border-2 border-dashed px-4 py-4 text-center transition-colors sm:py-5",
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
        <div className="space-y-1.5">
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
                  "shrink-0",
                  u.status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground",
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      <KbEditorModal
        open={editorOpen}
        group={group}
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
        <Sparkles className="size-3.5" />
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
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <DocActions
          busy={busy}
          onView={onView}
          onIntel={onIntel}
          onUnlink={onUnlink}
          onDelete={onDelete}
          buttonClassName="bg-background/80 shadow-sm backdrop-blur-sm"
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
          <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
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
          <div className="truncate font-mono text-[10px] text-muted-foreground">{meta}</div>
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
