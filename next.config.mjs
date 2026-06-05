/** @type {import('next').NextConfig} */

// Security headers — the browser only ever talks to this app's own origin
// (the proxy forwards to the gateway server-side), so connect-src can stay 'self'.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Hosts/IPs allowed to reach the dev server for HMR/assets when accessing it
// over the LAN / Tailscale (not just localhost). Set RANTAICLAW_UI_DEV_ORIGINS
// to a comma-separated list in .env.local. Dev-only; ignored in production.
const devOrigins = (process.env.RANTAICLAW_UI_DEV_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig = {
  reactStrictMode: true,
  // Brand-scoped build dir so the Nexus (NQRust) and RantaiClaw variants can be
  // dev-served / built side by side without clobbering each other's .next cache.
  distDir: process.env.NEXT_PUBLIC_BRAND === "nexus" ? ".next-nexus" : ".next",
  ...(devOrigins.length ? { allowedDevOrigins: devOrigins } : {}),
  // Lean container image: bundle a minimal standalone server.
  output: "standalone",
  // This app lives inside the RantAI-Agents monorepo tree but is its own project.
  // Pin the workspace root so Next.js doesn't infer the parent dir.
  turbopack: {
    root: import.meta.dirname,
  },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
