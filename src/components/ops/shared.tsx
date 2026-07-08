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
  children,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  onRefresh?: () => void;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-14 font-mono text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
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
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
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
      "cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
      className,
    )}
    {...props}
  />
));
IconButton.displayName = "IconButton";

export function KeyVal({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="kv-row border-b border-border/60 py-2">
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

export function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <RefreshCw /> Refresh
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
