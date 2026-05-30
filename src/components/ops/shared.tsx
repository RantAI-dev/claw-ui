"use client";

import * as React from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {error}
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary cursor-pointer"
          >
            <RefreshCw className="size-3.5" /> Retry
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Nothing here yet.</div>;
  }
  return <>{children}</>;
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "accent";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    accent: "text-accent",
  }[tone];
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 truncate text-xl font-semibold", toneClass)} title={typeof value === "string" ? value : undefined}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export function KeyVal({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{k}</span>
      <span className={cn("min-w-0 truncate text-right text-sm", mono && "font-mono text-xs")}>{v}</span>
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
  return <Badge variant={variant as never}>{severity}</Badge>;
}

export function CountBadge({ n }: { n: number }) {
  return <span className="text-xs text-muted-foreground">{formatNumber(n)}</span>;
}
