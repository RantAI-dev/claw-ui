"use client";

import * as React from "react";
import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Canonical centered empty/error block: icon tile + title + optional hint and
 * action. Every panel-level empty, error, and "nothing yet" state should render
 * this instead of hand-rolling the markup.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  tone = "default",
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "default" | "destructive";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-xl",
            tone === "destructive"
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </div>
      )}
      <div>
        <p className={cn("text-sm font-medium", tone === "destructive" && "text-destructive")}>
          {title}
        </p>
        {hint && (
          <p className="mx-auto mt-0.5 max-w-xs text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function PanelFrame({
  loading,
  error,
  empty,
  onRefresh,
  loaded,
  loadingLabel,
  children,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  onRefresh?: () => void;
  /**
   * Whether this panel has ever successfully loaded.
   *
   * With it, a REFRESH failure keeps the content on screen and shows the error
   * as a non-blocking strip; without it (still the default for callers that do
   * not pass it) any error blanked the whole panel — which made the most likely
   * outcome of a *successful* save an error screen, indistinguishable to the
   * operator from the save having failed.
   */
  loaded?: boolean;
  /** What is being loaded ("Loading usage…"); the bare default names nothing. */
  loadingLabel?: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-14 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {loadingLabel ?? "Loading…"}
      </div>
    );
  }
  if (error && loaded) {
    // Refresh failure: keep what is on screen, say what went wrong.
    return (
      <>
        <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{error}</span>
          {onRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh}>
              <RefreshCw /> Retry
            </Button>
          )}
        </div>
        {children}
      </>
    );
  }
  if (error) {
    return (
      <EmptyState
        tone="destructive"
        icon={<AlertTriangle className="size-6" />}
        title="Couldn't load this panel"
        hint={error}
        action={
          onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw /> Retry
            </Button>
          )
        }
      />
    );
  }
  if (empty) {
    return <EmptyState icon={<Inbox className="size-6" />} title="Nothing here yet." />;
  }
  return <>{children}</>;
}

/**
 * The one stat tile. `md` is the dashboard tile (StatusPanel, graph stats);
 * `sm` is the compact in-detail variant (entity degree/documents).
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  size = "md",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "accent";
  size?: "sm" | "md";
}) {
  const toneCls = {
    default: "text-foreground",
    success: "text-[var(--accent-green)]",
    warning: "text-[var(--accent-orange)]",
    destructive: "text-destructive",
    accent: "text-[var(--brand-sky)]",
  }[tone];
  const title =
    typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  return (
    <Card className={size === "sm" ? "px-3 py-2.5" : "px-4 py-3.5"}>
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </div>
      <div
        title={title}
        className={cn(
          "truncate font-medium tracking-tight",
          size === "sm" ? "mt-1 text-lg" : "mt-1.5 text-[22px]",
          toneCls,
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

/** Small ghost icon button — the repeated view/intel/delete/close affordance. */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground pointer-coarse:min-h-10 pointer-coarse:min-w-10",
      className,
    )}
    {...props}
  />
));
IconButton.displayName = "IconButton";

export function KeyVal({
  k,
  v,
  mono,
  stack,
}: {
  k: string;
  v: React.ReactNode;
  mono?: boolean;
  /** Key above the value, left-aligned: for long values (paths, urls) that
   *  would otherwise wrap right-aligned mid-token in a narrow column. */
  stack?: boolean;
}) {
  return (
    <div className={cn("kv-row border-b border-border/60 py-2 last:border-b-0", stack && "kv-stack")}>
      <span className="k">{k}</span>
      <span className="v" style={mono ? undefined : { fontFamily: "var(--font-sans)" }}>
        {v}
      </span>
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  const variant =
    s.includes("err") || s.includes("crit") || s.includes("fail")
      ? "destructive"
      : s.includes("warn")
        ? "warning"
        : s.includes("ok") || s.includes("pass") || s.includes("healthy")
          ? "success"
          : "secondary";
  return <Badge variant={variant}>{severity}</Badge>;
}

export function CountBadge({ n }: { n: number }) {
  return (
    <span className="font-mono text-xs text-muted-foreground">{n.toLocaleString()}</span>
  );
}

export function RefreshButton({
  onClick,
  spinning = false,
  label = "Refresh",
}: {
  onClick: () => void;
  spinning?: boolean;
  /** What the button re-runs when "Refresh" would be vague ("Re-run checks"). */
  label?: string;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={spinning}>
      <RefreshCw className={cn(spinning && "animate-spin")} /> {label}
    </Button>
  );
}

/** Panel section heading — one scale for every ops section label. */
export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[13px] font-medium tracking-tight">{children}</h3>
      {action}
    </div>
  );
}

/**
 * Windowed rendering for a list that can run long: show the first `first`
 * rows and let ShowMoreRow extend the window. Snaps back whenever `resetKey`
 * changes (a refetch, a new query) so a shorter result never inherits an
 * old, larger window.
 */
export function useListWindow(resetKey: unknown, first = 15) {
  const [shown, setShown] = React.useState(first);
  React.useEffect(() => setShown(first), [resetKey, first]);
  const showMore = React.useCallback(() => setShown((n) => n + 30), []);
  return { shown, showMore };
}

/** The row under a windowed list that extends it; renders nothing when the
 *  whole list is on screen. */
export function ShowMoreRow({
  remaining,
  onClick,
  className,
}: {
  remaining: number;
  onClick: () => void;
  className?: string;
}) {
  if (remaining <= 0) return null;
  return (
    <button
      type="button"
      className={cn(
        "w-full cursor-pointer px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
      onClick={onClick}
    >
      Show {remaining} more
    </button>
  );
}
