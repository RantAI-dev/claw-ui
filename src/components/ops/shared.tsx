"use client";

import * as React from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "64px 0",
          color: "var(--muted-foreground)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
        }}
      >
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          padding: "56px 0",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--destructive)",
            fontSize: 13,
          }}
        >
          <AlertTriangle className="size-4" /> {error}
        </div>
        {onRefresh && (
          <button className="gbtn" onClick={onRefresh}>
            <RefreshCw /> Retry
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return (
      <div
        style={{
          padding: "56px 0",
          textAlign: "center",
          color: "var(--muted-foreground)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
        }}
      >
        Nothing here yet.
      </div>
    );
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
  const color = {
    default: "var(--foreground)",
    success: "var(--accent-green)",
    warning: "var(--accent-orange)",
    destructive: "var(--destructive)",
    accent: "var(--brand-sky)",
  }[tone];
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div className="s-lab" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
        {label}
      </div>
      <div
        className="s-fig"
        title={typeof value === "string" ? value : undefined}
        style={{
          marginTop: 6,
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ marginTop: 3, fontSize: 11, color: "var(--muted-foreground)" }}>{hint}</div>
      )}
    </div>
  );
}

export function KeyVal({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div
      className="kv-row"
      style={{ padding: "8px 0", borderBottom: "1px solid color-mix(in oklab, var(--border) 60%, transparent)" }}
    >
      <span className="k">{k}</span>
      <span className="v" style={mono ? undefined : { fontFamily: "var(--font-sans)" }}>
        {v}
      </span>
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  const cls =
    s.includes("err") || s.includes("crit") || s.includes("fail")
      ? "red"
      : s.includes("warn")
        ? "amber"
        : s.includes("ok") || s.includes("pass") || s.includes("healthy")
          ? "green"
          : "dim";
  return (
    <span className={"badge " + cls}>
      <span className="bd" /> {severity}
    </span>
  );
}

export function CountBadge({ n }: { n: number }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>
      {n.toLocaleString()}
    </span>
  );
}
