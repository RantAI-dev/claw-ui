// Liveness + gateway-reachability probe for container healthchecks.
import { GATEWAY_URL, gatewayHeaders } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let gateway = "unknown";
  try {
    const res = await fetch(`${GATEWAY_URL}/api/v1/version`, {
      headers: gatewayHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    gateway = res.ok ? "ok" : `error_${res.status}`;
  } catch {
    gateway = "unreachable";
  }
  return Response.json({ ok: true, gateway });
}
