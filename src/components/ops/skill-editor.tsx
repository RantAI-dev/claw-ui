"use client";

import * as React from "react";
import { FilePen, Loader2, Plus, X } from "lucide-react";
import { api, ApiError, describeApiError } from "@/lib/api";
import type { Skill } from "@/lib/types";
import {
  emptyTemplate,
  readFields,
  slugify,
  writeField,
  type SkillFields,
} from "@/lib/skill-md";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
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
  // A blank name is the *starting* state of a new skill, not a mistake the user
  // has made yet. Flagging it the moment the panel opens greets every new skill
  // with a red error, so the complaint waits until the field has been used.
  const [nameTouched, setNameTouched] = React.useState(false);

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
        if (!cancelled) setLoadError(describeApiError(e));
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
  //
  // Derived, not stored. An effect that pushed `setView("markdown")` whenever
  // the form was unavailable latched permanently in edit mode: `md` is empty
  // until the fetch lands, empty does not parse, so the effect fired once and
  // nothing ever put the view back. Every pencil click opened in markdown.
  //
  // Deriving it means the transient cannot stick — the same reason the
  // document itself is one piece of state rather than two.
  const formAvailable = fields !== null;
  const effectiveView = formAvailable ? view : "markdown";

  const name = fields?.name.trim() ?? "";
  const derivedSlug = slugify(name);

  // The drawer's shared chrome autofocuses its close button. Land in the field
  // the user came here to fill instead — a new skill starts with typing a name.
  const nameRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (mode === "create") nameRef.current?.focus();
  }, [mode]);

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
      const detail = describeApiError(e);
      if (status === 409) toast.error(`Name already taken: ${detail}`);
      else if (status === 413)
        toast.error("Too large to save — the gateway caps bodies at 64 KB.");
      else toast.error(`Save failed: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      eyebrow={mode === "create" ? "New skill" : "Editing"}
      title={mode === "create" ? "Write a skill" : name || slug}
      icon={<FilePen className="size-4" />}
      onClose={onClose}
      className="max-w-3xl"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 font-mono text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : loadError ? (
          <p className="py-8 text-center text-sm text-destructive">{loadError}</p>
        ) : (
          <div className="space-y-5">
            {/* Hidden rather than disabled when the form can't be used: a dead
                button invites clicking, and the note below already says why. */}
            {formAvailable ? (
              <Segmented
                value={effectiveView}
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

            {effectiveView === "form" && fields ? (
              <div className="space-y-5">
                <Field
                  label="Name"
                  htmlFor="skill-name"
                  hint={
                    mode === "edit"
                      ? "Renaming isn’t supported here — create a new skill instead."
                      : `Folder: ${derivedSlug || "—"}`
                  }
                  problem={nameTouched ? nameProblem : null}
                >
                  <Input
                    id="skill-name"
                    ref={nameRef}
                    value={fields.name}
                    onChange={(e) => {
                      setNameTouched(true);
                      patch("name", e.target.value);
                    }}
                    onBlur={() => setNameTouched(true)}
                    // Renaming would keep the old folder while the manifest
                    // claimed a new name, and would orphan the config entry that
                    // tracks whether the skill is enabled. The gateway refuses
                    // it; do not let the user type a change we will throw away.
                    readOnly={mode === "edit"}
                    className={
                      mode === "edit"
                        ? "cursor-not-allowed bg-muted/40 text-muted-foreground"
                        : undefined
                    }
                    placeholder="Kopi Pagi"
                  />
                </Field>

                <Field
                  label="Description"
                  htmlFor="skill-description"
                  hint="The model reads this to decide when to use the skill. Be specific."
                >
                  <Textarea
                    id="skill-description"
                    value={fields.description}
                    onChange={(e) => patch("description", e.target.value)}
                    rows={3}
                    className="resize-y"
                    placeholder="Panduan menyeduh kopi V60 — rasio, suhu, dan waktu bloom."
                  />
                </Field>

                <Field label="Tags" htmlFor="skill-tags" hint="Enter or comma adds a tag.">
                  <TagInput
                    tags={fields.tags}
                    onChange={(tags) => patch("tags", tags)}
                  />
                </Field>

                <Field label="Instructions" hint="Enter adds the next step.">
                  <ListInput
                    items={fields.instructions}
                    onChange={(items) => patch("instructions", items)}
                  />
                </Field>
              </div>
            ) : (
              <Textarea
                id="skill-markdown"
                aria-label="SKILL.md source"
                value={md}
                onChange={(e) => setMd(e.target.value)}
                rows={22}
                spellCheck={false}
                className="min-h-[26rem] resize-y font-mono text-xs"
              />
            )}

            {collision && <p className="text-xs text-destructive">{collision}</p>}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
        {/* The cap used to surface only as a 413 after a failed save. Showing
            the running size makes the limit something you can steer away from. */}
        <span
          className={cn(
            "font-mono text-[10px]",
            tooLarge ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {(encodedSize / 1024).toFixed(1)} / 64 KB
          {tooLarge && " — too large to save"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={!canSave}
            title={!canSave && nameProblem ? nameProblem : undefined}
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {mode === "create" ? "Save skill" : "Save changes"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  problem,
  children,
}: {
  label: string;
  /** Omit for groups of inputs — the children carry their own `aria-label`. */
  htmlFor?: string;
  hint?: string;
  problem?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {/* A `<label>` with nothing to point at is worse than a heading: it looks
          clickable and does nothing, and AT announces an orphan. */}
      {htmlFor ? (
        <label
          htmlFor={htmlFor}
          className="block text-xs font-medium text-muted-foreground"
        >
          {label}
        </label>
      ) : (
        <span className="block text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
      {children}
      {problem ? (
        <p className="text-[10px] text-destructive">{problem}</p>
      ) : (
        hint && <p className="text-[10px] text-muted-foreground">{hint}</p>
      )}
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
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            aria-label={`Remove tag ${t}`}
            className="cursor-pointer text-muted-foreground hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Input
        id="skill-tags"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={tags.length ? "add another" : "add tag"}
        className="h-7 w-28 flex-1 border-0 bg-transparent px-1.5 text-xs shadow-none focus-visible:ring-0"
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
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const [focusAt, setFocusAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (focusAt === null) return;
    refs.current[focusAt]?.focus();
    setFocusAt(null);
  }, [focusAt, items.length]);

  const set = (i: number, v: string) =>
    onChange(items.map((x, idx) => (idx === i ? v : x)));

  const insertAfter = (i: number) => {
    const next = [...items];
    next.splice(i + 1, 0, "");
    onChange(next);
    setFocusAt(i + 1);
  };

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-4 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
            {i + 1}
          </span>
          <Input
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={item}
            aria-label={`Step ${i + 1}`}
            onChange={(e) => set(i, e.target.value)}
            // Enter continues the list. Reaching for the mouse after every
            // step is what makes writing more than two of them tedious.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                insertAfter(i);
              }
            }}
            className="h-8 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            aria-label={`Remove step ${i + 1}`}
            className="cursor-pointer text-muted-foreground hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => insertAfter(items.length - 1)}
        className="text-xs"
      >
        <Plus className="size-3.5" /> Add step
      </Button>
    </div>
  );
}
