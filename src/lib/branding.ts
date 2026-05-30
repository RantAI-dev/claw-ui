/** Centralized branding — mirrors the pattern from the RantAI-Agents app. */
export const brand = {
  name: "RantaiClaw",
  productName: "RantaiClaw UI",
  tagline: "Chat with your agent. Watch it work.",
  logo: "/logo-rantai-border.png",
  favicon: "/favicon-32x32.png",
} as const;

export type Brand = typeof brand;
