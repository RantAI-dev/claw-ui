/** Centralized branding for the RantaiClaw Console (dark, blue). */

export type BrandId = "rantaiclaw";

export interface Brand {
  id: BrandId;
  /** Short brand name. */
  name: string;
  /** Product name shown in titles / login. */
  productName: string;
  /** Wordmark split into [base, accent] — the accent half is brand-colored. */
  wordmark: [string, string];
  /** Small sub-label under the wordmark. */
  sub: string;
  tagline: string;
  /** Square mark used in the rail + login. */
  logo: string;
  favicon: string;
  /** Default color scheme for this brand. */
  theme: "dark" | "light";
}

const BRANDS: Record<BrandId, Brand> = {
  rantaiclaw: {
    id: "rantaiclaw",
    name: "RantaiClaw",
    productName: "RantaiClaw Console",
    wordmark: ["Rantai", "Claw"],
    sub: "Console",
    tagline: "Chat with your agent. Watch it work.",
    logo: "/rantaiclaw-mark.png",
    favicon: "/favicon-32x32.png",
    theme: "dark",
  },
};

export const brand: Brand = BRANDS.rantaiclaw;
