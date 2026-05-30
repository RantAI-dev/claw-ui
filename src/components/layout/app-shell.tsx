"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  LayoutDashboard,
  Moon,
  Sun,
  Circle,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/branding";
import { useGatewayStatus, type Connection } from "@/hooks/use-gateway-status";

const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/ops", label: "Ops", icon: LayoutDashboard },
];

/** Label visibility: hidden when collapsed; otherwise hidden below lg, shown at lg+. */
function labelCls(collapsed: boolean, extra?: string) {
  return cn("hidden", extra, !collapsed && "lg:inline");
}

function StatusDot({ connection, collapsed }: { connection: Connection; collapsed: boolean }) {
  const map: Record<Connection, { color: string; label: string }> = {
    connecting: { color: "text-warning", label: "Connecting…" },
    online: { color: "text-success", label: "Gateway online" },
    offline: { color: "text-destructive", label: "Gateway offline" },
  };
  const s = map[connection];
  return (
    <div className="flex items-center gap-2" title={s.label}>
      <Circle
        className={cn("size-2.5 fill-current", s.color, connection === "connecting" && "animate-pulse-glow")}
      />
      <span className={labelCls(collapsed, "text-xs text-sidebar-muted")}>{s.label}</span>
    </div>
  );
}

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center gap-2 rounded-md px-2 py-2 text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground cursor-pointer"
      title="Toggle theme"
    >
      {mounted && isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className={labelCls(collapsed, "text-xs")}>{mounted && isDark ? "Light" : "Dark"} mode</span>
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, connection } = useGatewayStatus();
  const [authOn, setAuthOn] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(localStorage.getItem("rc_sidebar_collapsed") === "1");
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setAuthOn(!!d.enabled))
      .catch(() => {});
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("rc_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  };

  // The login screen renders without the app chrome.
  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* Left rail */}
      <aside
        className={cn(
          "flex w-16 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          !collapsed && "lg:w-56",
        )}
      >
        <div className="flex h-14 items-center gap-2 px-3">
          <Image
            src={brand.logo}
            alt={brand.name}
            width={28}
            height={28}
            className="rounded-md"
            priority
          />
          <span className={labelCls(collapsed, "truncate text-sm font-semibold")}>{brand.name}</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 py-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
                )}
                title={label}
              >
                <Icon className="size-4 shrink-0" />
                <span className={labelCls(collapsed)}>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-1 border-t border-sidebar-border px-3 py-3">
          <StatusDot connection={connection} collapsed={collapsed} />
          {status?.version && (
            <span className={labelCls(collapsed, "text-[10px] text-sidebar-muted")}>
              v{status.version} · {status.provider || "no provider"}
            </span>
          )}
          <ThemeToggle collapsed={collapsed} />
          {authOn && (
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground cursor-pointer"
              title="Sign out"
            >
              <LogOut className="size-4" />
              <span className={labelCls(collapsed, "text-xs")}>Sign out</span>
            </button>
          )}
          {/* Collapse toggle — only meaningful at lg where the rail expands */}
          <button
            onClick={toggleCollapsed}
            className="hidden items-center gap-2 rounded-md px-2 py-2 text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground cursor-pointer lg:flex"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            <span className={labelCls(collapsed, "text-xs")}>Collapse</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
