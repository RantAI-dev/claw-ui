/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app lives inside the RantAI-Agents monorepo tree but is its own project.
  // Pin the workspace root so Next.js doesn't infer the parent dir (and pick up the
  // parent's middleware/src) just because parent lockfiles exist above us.
  turbopack: {
    root: import.meta.dirname,
  },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
