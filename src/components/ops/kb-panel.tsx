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
import { EmptyState, PanelFrame, RefreshButton } from "./shared";
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
          />
        ) : (
          <KbList groups={groups} onOpen={setSelected} />
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
}: {
  groups: ReturnType<typeof useAsync<KbGroup[]>>;
  onOpen: (g: KbGroup) => void;
}) {
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<KbGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<KbGroup | null>(null);
  const [deleting, setDeleting] = React.useState(false);

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
      setDeleteTarget(null);
      groups.refresh();
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
          <Button size="sm" onClick={openCreate}>
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
  return (
    <div
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open knowledge base ${group.name}`}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Hover / focus actions */}
      <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Edit"
          aria-label={`Edit knowledge base ${group.name}`}
          className="rounded-md bg-background/80 p-1.5 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-secondary hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          aria-label={`Delete knowledge base ${group.name}`}
          className="rounded-md bg-background/80 p-1.5 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-destructive/10 hover:text-destructive cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="flex items-start gap-3">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-lg shadow-sm"
          style={{ backgroundColor: group.color || DEFAULT_KB_COLOR }}
          aria-hidden
        >
          <FolderOpen className="size-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 pr-12">
            <span className="truncate text-sm font-semibold">{group.name}</span>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {docCount} doc{docCount === 1 ? "" : "s"}
            </Badge>
          </div>
          {group.description ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {group.description}
            </p>
          ) : (
            <p className="mt-1 text-xs italic text-muted-foreground/60">No description</p>
          )}
        </div>
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
      onClose={() => !saving && onClose()}
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
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Name
          </label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Product Docs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) save();
            }}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Description
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What lives in this knowledge base? (optional)"
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Color
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={cn(
                  "size-7 rounded-full transition-transform hover:scale-110 cursor-pointer",
                  color === c
                    ? "ring-2 ring-ring ring-offset-2 ring-offset-card"
                    : "",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
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
}: {
  group: KbGroup;
  onBack: () => void;
  onChanged: () => void;
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
      onChanged();
      onBack();
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
              <h3 className="truncate text-lg font-semibold tracking-tight">{group.name}</h3>
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
      <div
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Upload files to this knowledge base"
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
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragOver
            ? "border-accent bg-accent/5"
            : "border-border bg-muted/30 hover:border-accent/50 hover:bg-muted/50",
        )}
      >
        <UploadCloud
          className={cn(
            "size-7",
            dragOver ? "text-accent" : "text-muted-foreground",
          )}
        />
        <div className="text-sm font-medium">
          Drop files or <span className="text-accent">click to upload</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Documents &amp; images · ingested into this knowledge base · max 20 MB
        </div>
        <div className="mt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="size-3.5" /> Upload documents
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => imageRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="size-3.5" /> Upload images
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
  const btn = (hover: string) =>
    cn(
      "cursor-pointer rounded-md p-1.5 text-muted-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      buttonClassName,
      hover,
    );
  return (
    <>
      <button onClick={onView} title="View document" aria-label="View document" className={btn("hover:bg-accent/10 hover:text-accent")}>
        <Eye className="size-3.5" />
      </button>
      <button onClick={onIntel} title="Document intelligence" aria-label="Document intelligence" className={btn("hover:bg-accent/10 hover:text-accent")}>
        <Sparkles className="size-3.5" />
      </button>
      <button
        onClick={onUnlink}
        disabled={busy}
        title="Remove from this knowledge base"
        aria-label="Remove from this knowledge base"
        className={btn("hover:bg-secondary hover:text-foreground disabled:opacity-50")}
      >
        <FolderMinus className="size-3.5" />
      </button>
      <button
        onClick={onDelete}
        disabled={busy}
        title="Delete document from library"
        aria-label="Delete document from library"
        className={btn("hover:bg-destructive/10 hover:text-destructive disabled:opacity-50")}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </button>
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
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
        <p className="line-clamp-2 px-1 text-center text-sm font-medium leading-snug">
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
        <div className="truncate text-sm font-medium">{doc.title || doc.id.slice(0, 8)}</div>
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
        buttonClassName="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      />
    </div>
  );
}
