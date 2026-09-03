"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { brand } from "@/lib/branding";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  // `?reason=idle` means the proxy dropped the session for inactivity. Say so,
  // otherwise being bounced back here reads as a bug rather than a policy.
  const [idled, setIdled] = React.useState(false);
  React.useEffect(() => {
    setIdled(new URLSearchParams(window.location.search).get("reason") === "idle");
  }, []);

  // With the login gate off there is nothing to sign in to; a live form here
  // would take credentials it can never accept.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.enabled === false) router.replace("/chat");
      })
      .catch(() => {
        /* status unknown: leave the form usable */
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const retry = Number(res.headers.get("retry-after"));
        if (res.status === 429 && Number.isFinite(retry) && retry > 0) {
          const when = retry >= 60 ? `${Math.ceil(retry / 60)} min` : `${retry}s`;
          setError(`Too many attempts. Try again in ${when}.`);
        } else {
          setError(j.error || "Login failed");
        }
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next") || "/chat";
      // Only same-origin absolute paths. Reject "//host" / "/\\host" (protocol-
      // relative) which would be an open redirect off-site.
      const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\");
      router.replace(safeNext ? next : "/chat");
      router.refresh();
    } catch {
      setError("Network error. Is the server reachable?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <Image src={brand.logo} alt={brand.name} width={40} height={40} className="rounded-lg" priority unoptimized />
          <h1 className="text-base font-semibold">{brand.productName}</h1>
          <p className="text-xs text-muted-foreground">
            {idled ? "Signed out after a stretch of inactivity" : "Enter your username and password to continue"}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="pl-9"
            />
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="pl-9"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !username || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
