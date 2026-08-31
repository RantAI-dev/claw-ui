"use client";

import * as React from "react";
import {
  Blocks,
  Download,
  Loader2,
  Pencil,
  Plus,
  Power,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import type { ClawHubSkill, Skill } from "@/lib/types";
import {
  candidateAnnotation,
  candidatesFromError,
  indexInstalledSkills,
  installStateFor,
  skillReference,
  type SkillCandidate,
} from "@/lib/clawhub";
import { SKILLS_CHANGED } from "@/lib/console";
import { cn, formatNumber } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import { EmptyState, IconButton, PanelFrame, RefreshButton } from "./shared";
import { SkillEditor } from "./skill-editor";

/** The skill a pending uninstall refers to. Carries the display name because
 *  the confirmation asks about the thing the user sees, while every route
 *  addresses the directory — quoting the slug back made the prompt read as if
 *  it were about some other skill. */
interface PendingUninstall {
  slug: string;
  name: string;
  /** Where the skill came from; decides what "uninstall" destroys. */
  origin?: string;
}

function uninstallDescription(t: PendingUninstall): string {
  if (t.origin === "authored")
    return `“${t.name}” and its folder will be deleted. It is not on ClawHub, so there is no copy to reinstall.`;
  if (t.origin === "clawhub")
    return `“${t.name}” will be removed from the agent. You can reinstall it from ClawHub later.`;
  return `“${t.name}” will be removed from the agent.`;
}

export function SkillsPanel() {
  const installed = useAsync(() => api.skills(), []);
  const [view, setView] = React.useState<"installed" | "browse">("installed");
  const [query, setQuery] = React.useState("");
  const [hub, setHub] = React.useState<ClawHubSkill[] | null>(null);
  const [hubLoading, setHubLoading] = React.useState(false);
  const [hubError, setHubError] = React.useState<string | null>(null);
  // Bumped by Refresh. ClawHub failing is the case that most needs a retry, and
  // the error state had no way to ask for one.
  const [hubNonce, setHubNonce] = React.useState(0);
  const [working, setWorking] = React.useState<string | null>(null);
  const [pendingUninstall, setPendingUninstall] =
    React.useState<PendingUninstall | null>(null);
  const [ambiguous, setAmbiguous] = React.useState<{
    reference: string;
    candidates: SkillCandidate[];
  } | null>(null);
  // `null` = closed. `{mode:"create"}` or `{mode:"edit", slug}` = open.
  const [editor, setEditor] = React.useState<
    { mode: "create" } | { mode: "edit"; slug: string } | null
  >(null);

  // Indexed by publisher, not by name. ClawHub namespaces skills per
  // publisher, so a name-keyed set marked all four `weather` cards installed
  // once any one of them was — and missed entirely whenever a skill's manifest
  // name differed from its directory slug.
  const installedIndex = React.useMemo(
    () => indexInstalledSkills(installed.data?.skills || []),
    [installed.data],
  );

  React.useEffect(() => {
    if (view !== "browse") return;
    setHubLoading(true);
    setHubError(null);
    const t = setTimeout(
      async () => {
        try {
          const { items } = await api.clawhub(query.trim() || undefined);
          setHub(items);
        } catch (e) {
          setHubError(describeApiError(e));
          setHub([]);
        } finally {
          setHubLoading(false);
        }
      },
      query.trim() ? 350 : 0,
    );
    return () => clearTimeout(t);
  }, [view, query, hubNonce]);

  const skills = React.useMemo(
    () => installed.data?.skills || [],
    [installed.data],
  );

  // Reload this panel *and* tell the shell to reload its nav badge. Every
  // mutation below goes through here — a write the user can see in one place
  // and not the other reads as a failed write.
  const { refresh: refreshInstalled } = installed;
  const reload = React.useCallback(() => {
    refreshInstalled();
    window.dispatchEvent(new CustomEvent(SKILLS_CHANGED));
  }, [refreshInstalled]);

  // Client-side, over the list already in hand. The gateway has no filter
  // parameter and the list is small, so a round trip would only add latency.
  const matching = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) =>
      [s.name, s.description ?? "", s.slug ?? "", ...(s.tags || [])].some((f) =>
        f.toLowerCase().includes(q),
      ),
    );
  }, [skills, query]);

  const enabledCount = skills.filter((s) => s.enabled !== false).length;
  const disabledCount = skills.length - enabledCount;

  // Keyed on `slug`, not `name`: the gateway rejects a path parameter with a
  // space in it, so passing the display name 400s for every hand-written skill.
  const toggle = async (slug: string, label: string, enabled: boolean) => {
    // The busy flag was never set here, so the control's `disabled` never
    // engaged during the write and a second click raced the first.
    setWorking(slug);
    try {
      const r = await api.setSkillEnabled(slug, enabled);
      // Report what the server did, not what was asked for.
      toast.success(`${label} ${r.enabled ? "enabled" : "disabled"}`);
      reload();
    } catch (e) {
      toast.error(describeApiError(e));
    } finally {
      setWorking(null);
    }
  };

  const install = async (reference: string) => {
    setWorking(reference);
    const t = toast.loading(`Installing ${reference}…`);
    try {
      await api.installSkill(reference);
      toast.success(`Installed ${reference}`, { id: t });
      setAmbiguous(null);
      reload();
    } catch (e) {
      // A slug several publishers share is a question, not a failure: the
      // gateway answers 409 with the candidates. Ask which one rather than
      // picking for the user — an install stages code the agent will read
      // and act on, and popular slugs attract look-alike forks.
      const candidates = candidatesFromError(e);
      if (candidates) {
        toast.dismiss(t);
        setAmbiguous({ reference, candidates });
      } else {
        toast.error(`Install failed: ${e instanceof Error ? e.message : e}`, { id: t });
      }
    } finally {
      setWorking(null);
    }
  };

  const uninstall = async () => {
    const target = pendingUninstall;
    if (!target) return;
    setWorking(target.slug);
    try {
      const r = await api.uninstallSkill(target.slug);
      toast.success(`Removed ${r.name}`);
      setPendingUninstall(null);
      reload();
    } catch (e) {
      toast.error(`Remove failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setWorking(null);
    }
  };

  const refreshActive = () => {
    if (view === "installed") installed.refresh();
    else setHubNonce((n) => n + 1);
  };

  return (
    <div className="space-y-4">
      {/* One toolbar for both views. Write sits outside the view switch: it used
          to render only under Installed, which hid it behind a tab the moment a
          user with nothing installed most wanted to find it. */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={view}
          // One box serves both views; a ClawHub query must not silently
          // become the Installed filter. "Search ClawHub instead" carries it
          // on purpose and calls setView directly.
          onChange={(v) => {
            setView(v);
            setQuery("");
          }}
          options={[
            { value: "installed", label: `Installed${installed.data ? ` · ${installed.data.count}` : ""}` },
            { value: "browse", label: "Browse ClawHub" },
          ]}
        />
        <div className="relative min-w-[11rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={view === "installed" ? "Filter installed skills" : "Search ClawHub"}
            placeholder={
              view === "installed" ? "Filter installed skills…" : "Search ClawHub skills…"
            }
            className="pl-8 pr-8"
          />
          {view === "browse" && hubLoading ? (
            <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            query && (
              <IconButton
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1"
              >
                <X className="size-3.5" />
              </IconButton>
            )
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditor({ mode: "create" })}>
          <Plus className="size-3.5" /> Write
        </Button>
        <RefreshButton onClick={refreshActive} />
      </div>

      {view === "installed" ? (
        <PanelFrame
          loading={installed.loading}
          error={installed.error}
          onRefresh={installed.refresh}
        >
          {skills.length === 0 ? (
            // Replaces an auto-jump to the marketplace. Sending the user to
            // Browse answered "install one" before they had been asked, and it
            // took the Write button off screen on the way.
            <EmptyState
              icon={<Blocks className="size-6" />}
              title="No skills installed yet."
              hint="A skill is a set of standing instructions the agent follows. Write one, or install someone else's."
              action={
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
                    <Plus className="size-3.5" /> Write a skill
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setView("browse")}>
                    Browse ClawHub
                  </Button>
                </div>
              }
            />
          ) : matching.length === 0 ? (
            <EmptyState
              icon={<Search className="size-6" />}
              title={`Nothing installed matches “${query.trim()}”.`}
              action={
                <Button size="sm" variant="outline" onClick={() => setView("browse")}>
                  Search ClawHub instead
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                {query.trim()
                  ? `${matching.length} of ${skills.length} shown`
                  : `${enabledCount} enabled${disabledCount ? ` · ${disabledCount} disabled` : ""}`}
              </p>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {matching.map((s) => (
                  <InstalledCard
                    key={s.slug ?? s.name}
                    skill={s}
                    busy={working === s.slug}
                    onEdit={(slug) => setEditor({ mode: "edit", slug })}
                    onToggle={toggle}
                    onUninstall={setPendingUninstall}
                  />
                ))}
              </div>
            </div>
          )}
        </PanelFrame>
      ) : hubError ? (
        <EmptyState
          tone="destructive"
          title="ClawHub unavailable"
          hint={hubError}
          action={
            <Button variant="outline" size="sm" onClick={refreshActive}>
              Retry
            </Button>
          }
        />
      ) : hubLoading && !hub ? (
        <div className="flex items-center justify-center gap-2 py-14 font-mono text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Searching ClawHub…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {(hub || []).map((s) => {
            const reference = skillReference(s);
            const state = installStateFor(s, installedIndex);
            // Keyed on the reference, not the slug: several publishers
            // share popular slugs, so `working === s.slug` put every
            // same-slug card into the spinner on a single click.
            const busy = working === reference;
            return (
              <Card key={reference} className="flex flex-col gap-2 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{s.displayName}</span>
                      {/* `official` is a claim about the publisher;
                          `installed` below is a fact about this machine.
                          They can appear on the same card, so they must
                          not share a colour — a trust signal that looks
                          like a status badge stops reading as one. */}
                      {s.official && (
                        <Badge variant="accent" className="shrink-0">official</Badge>
                      )}
                      {s.version && <span className="text-[10px] text-muted-foreground">v{s.version}</span>}
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {reference}
                    </div>
                  </div>
                  {state.kind === "installed" ||
                  state.kind === "installed-unattributed" ? (
                    <Badge
                      variant="success"
                      className="shrink-0"
                      title={
                        state.kind === "installed-unattributed"
                          ? "This slug is installed, but the publisher was not recorded. Reinstall to attribute it."
                          : undefined
                      }
                    >
                      installed
                    </Badge>
                  ) : state.kind === "other-publisher" ? (
                    // The slug's directory holds someone else's copy. The
                    // gateway refuses to overwrite it, so offering Install
                    // here would promise something that cannot happen.
                    <Badge
                      variant="warning"
                      className="shrink-0"
                      title={`Installed from @${state.owner}. Uninstall it first to switch publishers.`}
                    >
                      @{state.owner} installed
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => install(reference)}
                      disabled={busy}
                      className="shrink-0"
                      aria-label={`Install ${s.displayName}`}
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                      Install
                    </Button>
                  )}
                </div>
                {s.summary && <p className="line-clamp-2 text-xs text-muted-foreground">{s.summary}</p>}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  {s.stars != null && (
                    <span className="flex items-center gap-0.5">
                      <Star className="size-3" /> {formatNumber(s.stars)}
                    </span>
                  )}
                  {s.downloads != null && (
                    <span className="flex items-center gap-0.5">
                      <Download className="size-3" /> {formatNumber(s.downloads)}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
          {!hubLoading && hub && hub.length === 0 && (
            <EmptyState
              className="col-span-full"
              title={query.trim() ? `No ClawHub skills match "${query.trim()}".` : "ClawHub returned no skills."}
              hint="Try another search, or write your own skill."
            />
          )}
        </div>
      )}

      {editor && (
        <SkillEditor
          mode={editor.mode}
          slug={editor.mode === "edit" ? editor.slug : undefined}
          existing={skills}
          onClose={() => setEditor(null)}
          onSaved={reload}
        />
      )}

      <ConfirmModal
        open={!!pendingUninstall}
        onClose={() => setPendingUninstall(null)}
        title="Uninstall skill?"
        description={pendingUninstall ? uninstallDescription(pendingUninstall) : undefined}
        confirmLabel="Uninstall"
        busy={working === pendingUninstall?.slug}
        onConfirm={uninstall}
      />

      <Modal
        open={!!ambiguous}
        onClose={() => setAmbiguous(null)}
        title="Which publisher?"
        description={
          ambiguous
            ? `“${ambiguous.reference}” is published by ${ambiguous.candidates.length} owners on ClawHub. Installing runs their code, so pick the one you meant.`
            : undefined
        }
      >
        <div className="flex flex-col gap-2">
          {(ambiguous?.candidates || []).map((c) => (
            <div
              key={c.reference}
              className="flex items-center justify-between gap-2 rounded-md border p-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs">{c.reference}</span>
                  {c.official && (
                    <Badge variant="accent" className="shrink-0">official</Badge>
                  )}
                </div>
                {/* Choosing between bare references is choosing blind — one of
                    the four `weather` publishers is a verbatim fork of the top
                    one, same name and summary. */}
                {candidateAnnotation(c) && (
                  <div className="text-[10px] text-muted-foreground">
                    {candidateAnnotation(c)}
                  </div>
                )}
                {c.url && (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="truncate text-[10px] text-muted-foreground underline"
                  >
                    {c.url}
                  </a>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => install(c.reference)}
                disabled={working === c.reference}
                className="shrink-0"
              >
                {working === c.reference ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Install
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/**
 * Where this copy came from, as the gateway resolved it. Absent origin renders
 * nothing rather than guessing — the type's own contract is that unknown must
 * not be read as "probably fine".
 *
 * `accent` is free to use for `yours` here: it marks `official` over in Browse,
 * and no card appears in both lists.
 */
function OriginBadge({ skill }: { skill: Skill }) {
  const kind = skill.origin?.kind;
  if (kind === "authored")
    return <Badge variant="accent" className="shrink-0 text-[10px]">yours</Badge>;
  if (kind === "clawhub")
    return (
      <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
        {skill.clawhub?.owner ? `@${skill.clawhub.owner}` : "clawhub"}
      </Badge>
    );
  if (kind === "bundled")
    return <Badge variant="secondary" className="shrink-0 text-[10px]">bundled</Badge>;
  if (kind === "git" || kind === "local")
    return <Badge variant="outline" className="shrink-0 text-[10px]">{kind}</Badge>;
  return null;
}

function InstalledCard({
  skill,
  busy,
  onEdit,
  onToggle,
  onUninstall,
}: {
  skill: Skill;
  busy: boolean;
  onEdit: (slug: string) => void;
  onToggle: (slug: string, label: string, enabled: boolean) => void;
  onUninstall: (target: PendingUninstall) => void;
}) {
  const enabled = skill.enabled !== false;
  // Without a slug the skill has no directory of its own (an open-skills file)
  // and no route can act on it.
  const slug = skill.slug;
  const editable = skill.origin?.kind === "authored" && !!slug;

  return (
    <Card className={cn("flex flex-col gap-2 p-3", !enabled && "opacity-60")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold">{skill.name}</span>
            {skill.version && (
              <span className="text-[10px] text-muted-foreground">v{skill.version}</span>
            )}
            <OriginBadge skill={skill} />
            {!enabled && (
              <Badge variant="warning" className="shrink-0 text-[10px]">disabled</Badge>
            )}
          </div>
          {slug && skill.name !== slug && (
            <div className="truncate font-mono text-[10px] text-muted-foreground">{slug}</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {editable && slug && (
            <IconButton
              onClick={() => onEdit(slug)}
              disabled={busy}
              title="Edit"
              aria-label={`Edit ${skill.name}`}
              className="disabled:opacity-50"
            >
              <Pencil className="size-3.5" />
            </IconButton>
          )}
          <IconButton
            onClick={() => slug && onToggle(slug, skill.name, !enabled)}
            disabled={busy || !slug}
            title={!slug ? "Not manageable here (no skill folder)" : enabled ? "Disable" : "Enable"}
            aria-label={enabled ? `Disable ${skill.name}` : `Enable ${skill.name}`}
            className={cn(
              "disabled:opacity-50",
              enabled && "text-success hover:bg-success/10 hover:text-success",
            )}
          >
            <Power className="size-3.5" />
          </IconButton>
          <IconButton
            onClick={() => slug && onUninstall({ slug, name: skill.name, origin: skill.origin?.kind })}
            disabled={busy || !slug}
            title={!slug ? "Not manageable here (no skill folder)" : "Uninstall"}
            aria-label={`Uninstall ${skill.name}`}
            className="hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </IconButton>
        </div>
      </div>
      {skill.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
      )}
      {(skill.tags?.length || skill.tools?.length) ? (
        <div className="flex flex-wrap gap-1.5">
          {skill.tags?.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
          ))}
          {skill.tools?.map((t) => (
            <Badge key={t} variant="outline" className="font-mono text-[10px]">{t}</Badge>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
