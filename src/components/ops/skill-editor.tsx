"use client";

import * as React from "react";
import { Loader2, Plus, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Skill } from "@/lib/types";
import {
  emptyTemplate,
  readFields,
  slugify,
  writeField,
  type SkillFields,
} from "@/lib/skill-md";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

/**
 * The gateway caps request bodies at 64 KiB and that limit covers these routes.
 * JSON escaping inflates newline-dense markdown, so check the encoded size
 * rather than the raw string — and say so plainly, because a bare 413 from the
 * middleware tells the user nothing.
 */
const MAX_BODY_BYTES = 64 * 1024;

interface SkillEditorProps {
  mode: "create" | "edit";
  /** Directory name. Required in edit mode; unused when creating. */
  slug?: string;
  /** Already-loaded skills, for immediate collision feedback. */
  existing: Skill[];
  onClose: () => void;
  onSaved: () => void;
}

export function SkillEditor({
  mode,
  slug,
  existing,
  onClose,
  onSaved,
}: SkillEditorProps) {
  // The ONLY data state. Form inputs read through `readFields(md)` and write
  // through `writeField`; they never hold their own copy. That is what makes
  // switching views free and keeps hand-written sections intact.
  const [md, setMd] = React.useState(() =>
    mode === "create" ? emptyTemplate() : "",
  );
  const [view, setView] = React.useState<"form" | "markdown">("form");
  const [loading, setLoading] = React.useState(mode === "edit");
  const [saving, setSaving] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (mode !== "edit" || !slug) return;
    let cancelled = false;
    setLoading(true);
    api
      .skillContent(slug)
      .then((r) => {
        if (!cancelled) setMd(r.content);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, slug]);

  const fields = React.useMemo(() => readFields(md), [md]);
  const patch = <K extends keyof SkillFields>(key: K, value: SkillFields[K]) =>
    setMd((cur) => writeField(cur, key, value));

  // A document the form cannot locate regions in is edited as markdown. One
  // rule, rather than a per-field degradation matrix.
  const formAvailable = fields !== null;
  React.useEffect(() => {
    if (!formAvailable) setView("markdown");
  }, [formAvailable]);

  const name = fields?.name.trim() ?? "";
  const derivedSlug = slugify(name);

  // Collision on BOTH keys: two different display names can slugify to one
  // directory, so checking names alone leaves the other collision reachable.
  // The server returns 409 for both; this check is for latency, not authority.
  const collision = React.useMemo(() => {
    if (mode !== "create" || !name) return null;
    const byName = existing.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (byName) return `A skill named “${byName.name}” already exists.`;
    const bySlug = existing.find(
      (s) => s.slug && derivedSlug && s.slug === derivedSlug,
    );
    if (bySlug)
      return `“${name}” would use the folder ${derivedSlug}, which “${bySlug.name}” already occupies.`;
    return null;
  }, [mode, name, derivedSlug, existing]);

  const encodedSize = React.useMemo(
    () => new Blob([JSON.stringify({ content: md })]).size,
    [md],
  );
  const tooLarge = encodedSize > MAX_BODY_BYTES;

  const nameProblem = !name
    ? "Needs a name."
    : !derivedSlug
      ? "That name has no characters usable in a folder name."
      : null;

  const canSave =
    !saving && !loading && !loadError && !collision && !tooLarge && !nameProblem;

  const save = async () => {
    setSaving(true);
    try {
      if (mode === "create") {
        const r = await api.createSkill(name, md);
        toast.success(`Created ${r.name}`);
      } else if (slug) {
        await api.saveSkillContent(slug, md);
        toast.success(`Saved ${name}`);
      }
      onSaved();
      onClose();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : undefined;
      const detail = e instanceof Error ? e.message : String(e);
      if (status === 409) toast.error(`Name already taken: ${detail}`);
      else if (status === 413)
        toast.error("Too large to save — the gateway caps bodies at 64 KB.");
      else toast.error(`Save failed: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "create" ? "Write a skill" : `Edit · ${slug}`}
      className="max-w-2xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {mode === "create" ? "Save skill" : "Save changes"}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 font-mono text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : loadError ? (
        <p className="py-8 text-center text-sm text-destructive">{loadError}</p>
      ) : (
        <div className="space-y-4">
          {/* Hidden rather than disabled when the form can't be used: a dead
              button invites clicking, and the note below already says why. */}
          {formAvailable ? (
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "form", label: "Form" },
                { value: "markdown", label: "Markdown" },
              ]}
            />
          ) : (
            <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              This file’s structure was changed by hand, so the form view can’t
              be used. Keep editing here — nothing is lost.
            </p>
          )}

          {view === "form" && fields ? (
            <div className="space-y-4">
              <Field label="Name" hint={mode === "edit" ? undefined : `Folder: ${derivedSlug || "—"}`}>
                <Input
                  value={fields.name}
                  onChange={(e) => patch("name", e.target.value)}
                  // Renaming would keep the old folder while the manifest
                  // claimed a new name, and would orphan the config entry that
                  // tracks whether the skill is enabled. The gateway refuses
                  // it; do not let the user type a change we will throw away.
                  readOnly={mode === "edit"}
                  className={mode === "edit" ? "opacity-70" : undefined}
                  placeholder="Kopi Pagi"
                />
              </Field>
              {mode === "edit" && (
                <p className="-mt-3 text-[10px] text-muted-foreground">
                  Renaming isn’t supported here — create a new skill instead.
                </p>
              )}

              <Field
                label="Description"
                hint="The model reads this to decide when to use the skill. Be specific."
              >
                <Textarea
                  value={fields.description}
                  onChange={(e) => patch("description", e.target.value)}
                  rows={3}
                  className="resize-y"
                />
              </Field>

              <Field label="Tags">
                <TagInput
                  tags={fields.tags}
                  onChange={(tags) => patch("tags", tags)}
                />
              </Field>

              <Field label="Instructions">
                <ListInput
                  items={fields.instructions}
                  onChange={(items) => patch("instructions", items)}
                />
              </Field>
            </div>
          ) : (
            <Textarea
              value={md}
              onChange={(e) => setMd(e.target.value)}
              rows={20}
              spellCheck={false}
              className="resize-y font-mono text-xs"
            />
          )}

          {nameProblem && (
            <p className="text-xs text-destructive">{nameProblem}</p>
          )}
          {collision && <p className="text-xs text-destructive">{collision}</p>}
          {tooLarge && (
            <p className="text-xs text-destructive">
              {Math.round(encodedSize / 1024)} KB — over the gateway’s 64 KB
              limit. Shorten it before saving.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const t = draft.trim();
    if (!t || tags.includes(t)) return;
    onChange([...tags, t]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            aria-label={`Remove tag ${t}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="add tag"
        className="h-7 w-28 text-xs"
      />
    </div>
  );
}

function ListInput({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const set = (i: number, v: string) =>
    onChange(items.map((x, idx) => (idx === i ? v : x)));
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-4 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
            {i + 1}
          </span>
          <Input
            value={item}
            onChange={(e) => set(i, e.target.value)}
            className="h-8 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            aria-label={`Remove step ${i + 1}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange([...items, ""])}
        className="text-xs"
      >
        <Plus className="size-3.5" /> Add step
      </Button>
    </div>
  );
}
