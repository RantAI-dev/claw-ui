"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { MessageSquare, LayoutDashboard, Moon, Sun, Circle } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/branding";
import { useGatewayStatus, type Connection } from "@/hooks/use-gateway-status";

const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/ops", label: "Ops", icon: LayoutDashboard },
];

function StatusDot({ connection }: { connection: Connection }) {
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
      <span className="hidden text-xs text-sidebar-muted lg:inline">{s.label}</span>
    </div>
  );
}

function ThemeToggle() {
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
      <span className="hidden text-xs lg:inline">{mounted && isDark ? "Light" : "Dark"} mode</span>
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, connection } = useGatewayStatus();

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* Left rail */}
      <aside className="flex w-[64px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:w-56">
        <div className="flex h-14 items-center gap-2 px-3">
          <Image
            src={brand.logo}
            alt={brand.name}
            width={28}
            height={28}
            className="rounded-md"
            priority
          />
          <span className="hidden truncate text-sm font-semibold lg:inline">{brand.name}</span>
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
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-1 border-t border-sidebar-border px-3 py-3">
          <StatusDot connection={connection} />
          {status?.version && (
            <span className="hidden text-[10px] text-sidebar-muted lg:inline">
              v{status.version} · {status.provider || "no provider"}
            </span>
          )}
          <ThemeToggle />
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
