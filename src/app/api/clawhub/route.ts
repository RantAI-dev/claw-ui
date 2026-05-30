// Server-side proxy to the ClawHub skill registry (clawhub.ai). Browse the
// top-by-stars list, or search via ?q=. Normalizes both response shapes.
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const BASE = "https://clawhub.ai/api/v1";

interface ClawHubSkill {
  slug: string;
  displayName: string;
  summary: string;
  stars?: number;
  downloads?: number;
  version?: string;
}

function norm(it: Record<string, unknown>): ClawHubSkill {
  const stats = (it.stats as Record<string, number> | undefined) ?? {};
  const latest = (it.latestVersion as Record<string, string> | undefined) ?? {};
  const tags = (it.tags as Record<string, string> | undefined) ?? {};
  return {
    slug: String(it.slug ?? ""),
    displayName: String(it.displayName ?? it.slug ?? ""),
    summary: String(it.summary ?? ""),
    stars: typeof stats.stars === "number" ? stats.stars : undefined,
    downloads: typeof stats.downloads === "number" ? stats.downloads : undefined,
    version: latest.version ?? tags.latest ?? undefined,
  };
}

// Cache the browse list in-process (top-by-stars rarely changes) to avoid
// hammering ClawHub. Search is always live.
let browseCache: { at: number; items: ClawHubSkill[] } | null = null;
const BROWSE_TTL_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  try {
    if (q) {
      const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}&type=skill`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
      if (!res.ok) return Response.json({ error: `clawhub ${res.status}` }, { status: 502 });
      const d = await res.json();
      const raw = (d.results || d.items || []) as Record<string, unknown>[];
      return Response.json({ items: raw.map(norm).filter((s) => s.slug) });
    }

    if (browseCache && Date.now() - browseCache.at < BROWSE_TTL_MS) {
      return Response.json({ items: browseCache.items, cached: true });
    }
    const res = await fetch(`${BASE}/skills?sort=stars`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) return Response.json({ error: `clawhub ${res.status}` }, { status: 502 });
    const d = await res.json();
    const items = ((d.items || []) as Record<string, unknown>[]).map(norm).filter((s) => s.slug);
    browseCache = { at: Date.now(), items };
    return Response.json({ items });
  } catch (e) {
    return Response.json(
      { error: "clawhub_unreachable", detail: String(e instanceof Error ? e.message : e) },
      { status: 502 },
    );
  }
}
