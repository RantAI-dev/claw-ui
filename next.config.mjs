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

const nextConfig = {
  reactStrictMode: true,
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
