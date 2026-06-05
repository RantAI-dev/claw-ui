"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { brand } from "@/lib/branding";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Login failed");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next") || "/chat";
      router.replace(next.startsWith("/") ? next : "/chat");
      router.refresh();
    } catch {
      setError("Network error — is the server reachable?");
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
          <p className="text-xs text-muted-foreground">Enter your password to continue</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="pl-9"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
