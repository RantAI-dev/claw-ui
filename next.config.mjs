/** @type {import('next').NextConfig} */

// Security headers — the browser only ever talks to this app's own origin
// (the proxy forwards to the gateway server-side), so connect-src can stay 'self'.
// `'unsafe-eval'` is only needed by the dev server (Turbopack HMR / React Fast
// Refresh eval source maps); production runtime code does not use eval, so drop
// it from the production policy — this is the page that renders untrusted model
// output, and CSP is its last XSS mitigation.
// TODO: nonce the script-src to drop 'unsafe-inline' too (needs a per-request
// nonce threaded through the proxy and Next's script tags).
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
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
  // KB document uploads (PDFs / office docs) routinely exceed Next's 10 MiB
  // default request-body cap. The /api/rc/kb/ingest proxy buffers the upload and
  // forwards it to the gateway (which accepts up to 32 MiB); without raising this,
  // bodies over 10 MiB are silently truncated and the gateway then rejects the
  // multipart with "file bytes: Error parsing multipart/form-data request".
  experimental: {
    proxyClientMaxBodySize: 32 * 1024 * 1024,
  },
  ...(devOrigins.length ? { allowedDevOrigins: devOrigins } : {}),
  // Lean container image: bundle a minimal standalone server.
  output: "standalone",
  // No server-side image optimization: every <Image> already uses `unoptimized`.
  images: { unoptimized: true },
  // `sharp` is an optionalDependency of `next` itself (lazily required inside
  // next's image optimizer) and stays a candidate for the standalone trace even
  // when images.unoptimized is set, since Next's tracer works off static
  // require() analysis, not runtime config. Exclude it explicitly so the
  // standalone artifact stays pure-JS / platform-independent.
  outputFileTracingExcludes: {
    "*": ["node_modules/sharp/**", "node_modules/@img/**"],
  },
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
