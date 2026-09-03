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
  RefreshCw,
} from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import type { ClawHubSkill, Skill } from "@/lib/types";
import {
  candidateAnnotation,
  candidatesFromError,
  describeHubError,
  indexInstalledSkills,
  installStateFor,
  skillReference,
  type SkillCandidate,
  type InstallState,
} from "@/lib/clawhub";
import { SKILLS_CHANGED } from "@/lib/console";
import {
  countLine,
  removalCopy,
  skillCounts,
  skillState,
  skillsVerdict,
  versionLabel,
  type SkillsVerdict,
} from "@/lib/skills";
import { cn, formatNumber } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import { EmptyState, IconButton, PanelFrame, RefreshButton, SectionTitle } from "./shared";
import { SkillEditor } from "./skill-editor";

/**
 * The page opens with the answer: is every standing instruction in force?
 * Not a card; the whitespace around the band marks the focal point, as on
 * Status, Channels, Providers and Schedules.
 */
function SkillsBand({ verdict }: { verdict: SkillsVerdict }) {
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

/** First windowful of the ClawHub browse list; "Show more" extends it. */
const HUB_PAGE = 15;

export function SkillsPanel() {
  const installed = useAsync(() => api.skills(), []);
  // Two lists, two boxes: the filter belongs to the installed column, the
  // search to the ClawHub column. Both are on screen at once, so neither can
  // leak into the other.
  const [installedQuery, setInstalledQuery] = React.useState("");
  const [hubQuery, setHubQuery] = React.useState("");
  const [hub, setHub] = React.useState<ClawHubSkill[] | null>(null);
  const [hubLoading, setHubLoading] = React.useState(false);
  const [hubError, setHubError] = React.useState<string | null>(null);
  // Bumped by Refresh. ClawHub failing is the case that most needs a retry, and
  // the error state had no way to ask for one.
  const [hubNonce, setHubNonce] = React.useState(0);
  // The browse list can run long; render a windowful and let "Show more"
  // extend it. Search stays the primary way to reach a specific skill.
  const [hubShown, setHubShown] = React.useState(HUB_PAGE);
  const [working, setWorking] = React.useState<string | null>(null);
  const [pendingUninstall, setPendingUninstall] = React.useState<Skill | null>(null);
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

  // Set by Refresh, consumed by the next fetch: the browse list is cached in
  // the console's own proxy for ten minutes, so a Refresh that did not say
  // "fresh" came back with the same list and looked like it did nothing.
  const hubFresh = React.useRef(false);
  React.useEffect(() => {
    setHubLoading(true);
    setHubError(null);
    const fresh = hubFresh.current;
    hubFresh.current = false;
    const t = setTimeout(
      async () => {
        try {
          const { items } = await api.clawhub(hubQuery.trim() || undefined, { fresh });
          setHub(items);
          setHubShown(HUB_PAGE);
        } catch (e) {
          // Not `describeApiError`: its 502 branch blames the gateway, and the
          // gateway is not on this path.
          setHubError(describeHubError(e));
          // `null`, not `[]`: Retry shows the loading line again instead of a
          // blank grid with only the spinner in the search box.
          setHub(null);
        } finally {
          setHubLoading(false);
        }
      },
      hubQuery.trim() ? 350 : 0,
    );
    return () => clearTimeout(t);
  }, [hubQuery, hubNonce]);

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
  // Where focus goes after a removal: the trigger leaves with the card, and
  // the confirm's own restore has nothing left to land on.
  const writeRef = React.useRef<HTMLButtonElement>(null);

  // Client-side, over the list already in hand. The gateway has no filter
  // parameter and the list is small, so a round trip would only add latency.
  const matching = React.useMemo(() => {
    const q = installedQuery.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) =>
      [s.name, s.description ?? "", s.slug ?? "", ...(s.tags || [])].some((f) =>
        f.toLowerCase().includes(q),
      ),
    );
  }, [skills, installedQuery]);

  const counts = React.useMemo(() => skillCounts(skills), [skills]);
  const removal = pendingUninstall ? removalCopy(pendingUninstall) : null;

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
        toast.error(`Install failed: ${describeApiError(e)}`, { id: t });
      }
    } finally {
      setWorking(null);
    }
  };

  const uninstall = async () => {
    const target = pendingUninstall;
    if (!target?.slug) return;
    const copy = removalCopy(target);
    setWorking(target.slug);
    try {
      await api.uninstallSkill(target.slug);
      toast.success(copy.toast);
      setPendingUninstall(null);
      // Refetch before moving focus: until the list is back the removed
      // card's button is still in the DOM and the confirm restores to it.
      await refreshInstalled();
      window.dispatchEvent(new CustomEvent(SKILLS_CHANGED));
      writeRef.current?.focus();
    } catch (e) {
      toast.error(`${copy.confirm} failed: ${describeApiError(e)}`);
    } finally {
      setWorking(null);
    }
  };

  const hubRefresh = () => {
    hubFresh.current = true;
    setHubNonce((n) => n + 1);
  };

  // "Search ClawHub instead": the one deliberate hand-off between the boxes.
  const hubSearchRef = React.useRef<HTMLInputElement>(null);
  const handOffToHub = () => {
    setHubQuery(installedQuery);
    hubSearchRef.current?.scrollIntoView({ block: "center" });
    hubSearchRef.current?.focus();
  };

  return (
    <>
      <div className="max-w-[1120px] space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <PanelFrame
              loading={installed.loading}
              error={installed.error}
              loaded={installed.loaded}
              loadingLabel="Loading skills…"
              onRefresh={installed.refresh}
            >
              {installed.data && <SkillsBand verdict={skillsVerdict(skills)} />}
            </PanelFrame>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* The page's one primary action, reachable without scanning past
                the list it creates for. */}
            <Button ref={writeRef} size="sm" onClick={() => setEditor({ mode: "create" })}>
              <Plus className="size-3.5" /> Write a skill
            </Button>
            <RefreshButton onClick={installed.refresh} spinning={installed.refreshing} />
          </div>
        </div>

        {/* The 7/5 split gives the installed list the width to state its
            facts; writing a skill and fetching one compose in the narrow
            column. On phones the list (the answer) comes first. */}
        {installed.data && (
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <SectionTitle>
                Installed <span className="text-muted-foreground">· {skills.length}</span>
              </SectionTitle>
              {skills.length === 0 ? (
                <EmptyState
                  icon={<Blocks className="size-6" />}
                  title="No skills installed yet."
                  hint="A skill is a set of standing instructions the agent follows. Write one, or install one from ClawHub."
                />
              ) : (
                <>
                  <div className="relative mb-3 max-w-sm">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={installedQuery}
                      onChange={(e) => setInstalledQuery(e.target.value)}
                      aria-label="Filter installed skills"
                      placeholder="Filter skills…"
                      className="h-8 pl-8 pr-8 text-xs"
                    />
                    {installedQuery && (
                      <IconButton
                        onClick={() => setInstalledQuery("")}
                        aria-label="Clear filter"
                        className="absolute right-0.5 top-1/2 -translate-y-1/2"
                      >
                        <X className="size-3.5" />
                      </IconButton>
                    )}
                  </div>
                  {installedQuery.trim() && matching.length > 0 && (
                    <p className="mb-3 text-xs text-muted-foreground">
                      {countLine(counts, {
                        query: installedQuery.trim(),
                        shown: matching.length,
                      })}
                    </p>
                  )}
                  {matching.length === 0 ? (
                    <EmptyState
                      icon={<Search className="size-6" />}
                      title={`Nothing installed matches “${installedQuery.trim()}”.`}
                      action={
                        <Button size="sm" variant="outline" onClick={handOffToHub}>
                          Search ClawHub instead
                        </Button>
                      }
                    />
                  ) : (
                    <Card className="divide-y divide-border">
                      {matching.map((s) => (
                        <InstalledRow
                          key={s.slug ?? s.name}
                          skill={s}
                          busy={working === s.slug}
                          onEdit={(slug) => setEditor({ mode: "edit", slug })}
                          onToggle={toggle}
                          onUninstall={setPendingUninstall}
                        />
                      ))}
                    </Card>
                  )}
                </>
              )}
            </div>

            <div className="min-w-0 lg:col-span-5">
              <div>
                <SectionTitle
                  action={
                    <IconButton
                      onClick={hubRefresh}
                      title="Refresh the ClawHub list"
                      aria-label="Refresh the ClawHub list"
                    >
                      <RefreshCw className={cn("size-3.5", hubLoading && "animate-spin")} />
                    </IconButton>
                  }
                >
                  ClawHub
                </SectionTitle>
                <p className="text-xs text-muted-foreground">
                  Community skills. Installing stages code the agent reads, so pick
                  publishers you trust.
                </p>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={hubSearchRef}
                    value={hubQuery}
                    onChange={(e) => setHubQuery(e.target.value)}
                    aria-label="Search ClawHub"
                    placeholder="Search ClawHub…"
                    className="h-8 pl-8 pr-8 text-xs"
                  />
                  {hubLoading ? (
                    <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                  ) : (
                    hubQuery && (
                      <IconButton
                        onClick={() => setHubQuery("")}
                        aria-label="Clear search"
                        className="absolute right-0.5 top-1/2 -translate-y-1/2"
                      >
                        <X className="size-3.5" />
                      </IconButton>
                    )
                  )}
                </div>
                <div className="mt-3">
                  {hubError ? (
                    <EmptyState
                      tone="destructive"
                      title="ClawHub unavailable"
                      hint={hubError}
                      action={
                        <Button size="sm" variant="outline" onClick={hubRefresh}>
                          Retry
                        </Button>
                      }
                    />
                  ) : hubLoading && !hub ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />{" "}
                      {hubQuery.trim() ? "Searching ClawHub…" : "Loading the ClawHub list…"}
                    </div>
                  ) : hub && hub.length === 0 ? (
                    <EmptyState
                      title={
                        hubQuery.trim()
                          ? `No ClawHub skills match “${hubQuery.trim()}”.`
                          : "ClawHub returned no skills."
                      }
                      hint={hubQuery.trim() ? "Try another word, or write one." : undefined}
                    />
                  ) : hub ? (
                    <Card className="p-0">
                      <ul>
                        {hub.slice(0, hubShown).map((h) => (
                          <HubRow
                            key={skillReference(h)}
                            s={h}
                            state={installStateFor(h, installedIndex)}
                            busy={working === skillReference(h)}
                            onInstall={install}
                          />
                        ))}
                      </ul>
                      {hub.length > hubShown && (
                        <button
                          className="w-full cursor-pointer border-t border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          onClick={() => setHubShown((s) => s + 30)}
                        >
                          Show {hub.length - hubShown} more
                        </button>
                      )}
                    </Card>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {editor && (
        <SkillEditor
          mode={editor.mode}
          slug={editor.mode === "edit" ? editor.slug : undefined}
          existing={skills}
          onClose={() => setEditor(null)}
          onSaved={reload}
        />
      )}

      {/* The words follow the origin: an authored skill's only copy is the
          directory being removed, a ClawHub one can be fetched again. */}
      <ConfirmModal
        open={!!pendingUninstall}
        onClose={() => setPendingUninstall(null)}
        title={removal?.title ?? ""}
        description={removal?.body}
        confirmLabel={removal?.confirm ?? "Uninstall"}
        busy={!!pendingUninstall && working === pendingUninstall.slug}
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
          {(ambiguous?.candidates || []).map((c, i) => (
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
                // First focus on the first choice, not on the dialog's X.
                data-autofocus={i === 0 ? true : undefined}
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
    </>
  );
}
function OriginBadge({ skill }: { skill: Skill }) {
  const kind = skill.origin?.kind;
  if (kind === "authored")
    return <Badge variant="accent" className="shrink-0 text-[11px]">yours</Badge>;
  if (kind === "clawhub")
    return (
      <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
        {skill.clawhub?.owner ? `@${skill.clawhub.owner}` : "clawhub"}
      </Badge>
    );
  if (kind === "bundled")
    return <Badge variant="secondary" className="shrink-0 text-[11px]">bundled</Badge>;
  if (kind === "git" || kind === "local")
    return <Badge variant="outline" className="shrink-0 text-[11px]">{kind}</Badge>;
  return null;
}

function InstalledRow({
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
  onUninstall: (skill: Skill) => void;
}) {
  // `active` is what the loader injects; `enabled` is only the config flag.
  const state = skillState(skill);
  const enabled = skill.enabled !== false;
  // Without a slug the skill has no directory of its own (an open-skills file)
  // and no route can act on it.
  const slug = skill.slug;
  const editable = skill.origin?.kind === "authored" && !!slug;
  const version = versionLabel(skill);
  const removal = removalCopy(skill);
  const facts: React.ReactNode[] = [];
  if (slug && skill.name !== slug) {
    facts.push(
      <span key="slug" className="font-mono">
        {slug}
      </span>,
    );
  }
  for (const t of skill.tags || []) facts.push(<span key={`tag-${t}`}>{t}</span>);
  for (const t of skill.tools || [])
    facts.push(
      <span key={`tool-${t}`} className="font-mono">
        {t}
      </span>,
    );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            title={skill.name}
            className={cn(
              "truncate text-sm font-medium",
              // Disabled reads as muted ink, not a washed-out row: the badge
              // carries the state and the text stays at AA.
              state.kind === "disabled" && "text-muted-foreground",
            )}
          >
            {skill.name}
          </span>
          {version && <span className="text-[11px] text-muted-foreground">{version}</span>}
          <OriginBadge skill={skill} />
          {state.kind === "disabled" && (
            <Badge variant="warning" className="shrink-0 text-[11px]">
              disabled
            </Badge>
          )}
          {state.kind === "not-loadable" && (
            <Badge variant="warning" className="shrink-0 text-[11px]">
              not loadable
            </Badge>
          )}
        </div>
        {facts.length > 0 && (
          <div className="mt-0.5 break-words text-xs text-muted-foreground">
            {facts.map((f, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span aria-hidden> · </span>}
                {f}
              </React.Fragment>
            ))}
          </div>
        )}
        {state.reasons.length > 0 && (
          <div className="mt-0.5 break-words text-xs text-muted-foreground">
            <span
              aria-hidden
              className="mr-1.5 inline-block size-1.5 rounded-full align-middle"
              style={{ background: "var(--accent-orange)" }}
            />
            {state.kind === "disabled" ? "Would not load: " : "Not loaded: "}
            {state.reasons.join("; ")}
          </div>
        )}
        {skill.description && (
          // One line on wide screens; the title keeps the whole sentence
          // reachable, and it is what the model uses to pick the skill.
          <div
            className="mt-0.5 break-words text-xs text-muted-foreground/80 sm:truncate"
            title={skill.description}
          >
            {skill.description}
          </div>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-0.5 max-sm:basis-full max-sm:justify-end">
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
          title={enabled ? "Disable" : "Enable"}
          aria-label={enabled ? `Disable ${skill.name}` : `Enable ${skill.name}`}
          className={cn(
            "disabled:opacity-50",
            // Green means "in force", not "switched on": an enabled skill the
            // loader dropped keeps the plain icon and the reasons line says why.
            state.kind === "active" && "text-success hover:bg-success/10 hover:text-success",
          )}
        >
          <Power className="size-3.5" />
        </IconButton>
        <IconButton
          onClick={() => slug && onUninstall(skill)}
          disabled={busy || !slug}
          title={removal.confirm}
          aria-label={removal.actionLabel}
          className="hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </IconButton>
      </div>
    </div>
  );
}

function HubRow({
  s,
  state,
  busy,
  onInstall,
}: {
  s: ClawHubSkill;
  state: InstallState;
  busy: boolean;
  onInstall: (reference: string) => void;
}) {
  const reference = skillReference(s);
  // As text under the reference, not a tooltip: a tooltip is invisible on
  // touch and to a keyboard. "Uninstall, then install again" because
  // `install_one` leaves a slug that is already present alone.
  const note =
    state.kind === "installed-unattributed"
      ? "Installed, publisher not recorded. Uninstall it, then install it again to record one."
      : state.kind === "other-publisher"
        ? `Installed from @${state.owner}. Uninstall it first to switch publishers.`
        : null;
  return (
    <li className="border-b border-border/60 px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <span title={s.displayName} className="min-w-0 truncate text-sm font-medium">
          {s.displayName}
        </span>
        {s.official && (
          <Badge variant="accent" className="shrink-0 text-[11px]">
            official
          </Badge>
        )}
        {s.version && (
          <span className="shrink-0 text-[11px] text-muted-foreground">v{s.version}</span>
        )}
        <span className="ml-auto shrink-0">
          {state.kind === "installed" || state.kind === "installed-unattributed" ? (
            <Badge variant="success">installed</Badge>
          ) : state.kind === "other-publisher" ? (
            // The slug's directory holds someone else's copy; the gateway
            // refuses to overwrite it, so Install would promise something
            // that cannot happen.
            <Badge variant="warning">@{state.owner} installed</Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onInstall(reference)}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Install
            </Button>
          )}
        </span>
      </div>
      <div className="mt-0.5 break-words font-mono text-[11px] text-muted-foreground">
        {reference}
      </div>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      {s.summary && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80" title={s.summary}>
          {s.summary}
        </p>
      )}
      {(s.stars != null || s.downloads != null) && (
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          {s.stars != null && (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3" /> {formatNumber(s.stars)}
            </span>
          )}
          {s.downloads != null && (
            <span className="inline-flex items-center gap-1">
              <Download className="size-3" /> {formatNumber(s.downloads)}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
