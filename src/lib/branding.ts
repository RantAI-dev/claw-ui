/** Centralized, brand-switchable branding.
 *
 * Select the brand at build/run time with `NEXT_PUBLIC_BRAND`:
 *   NEXT_PUBLIC_BRAND=nexus  → NQRust Console (NexusQuantum, light, orange)
 *   (unset / anything else)  → RantaiClaw Console (dark, blue)
 *
 * The CSS theme is keyed off `data-brand` on <html> (see globals.css), so the
 * whole console reskins from one flag. */

export type BrandId = "rantaiclaw" | "nexus";

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
  nexus: {
    id: "nexus",
    name: "NQRust",
    productName: "NQRust Console",
    wordmark: ["NQ", "Rust"],
    sub: "Console",
    tagline: "Your microVM agent console.",
    logo: "/nqrust-mark.svg",
    favicon: "/nqrust-mark.svg",
    theme: "light",
  },
};

const SELECTED: BrandId = process.env.NEXT_PUBLIC_BRAND === "nexus" ? "nexus" : "rantaiclaw";

export const brand: Brand = BRANDS[SELECTED];
