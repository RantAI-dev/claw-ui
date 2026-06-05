import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Montserrat, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { brand } from "@/lib/branding";

const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-geist",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-geist-mono",
  display: "swap",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-montserrat",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${brand.productName}`,
  description: brand.tagline,
  icons: { icon: brand.favicon, apple: brand.favicon },
};

export const viewport: Viewport = {
  themeColor: brand.theme === "dark" ? "#0b0f1a" : "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const dark = brand.theme === "dark";
  return (
    <html
      lang="en"
      data-brand={brand.id}
      className={dark ? "dark" : undefined}
      suppressHydrationWarning
    >
      <body
        className={`${geist.variable} ${geistMono.variable} ${montserrat.variable} ${jetbrains.variable} antialiased`}
      >
        <ThemeProvider attribute="class" forcedTheme={brand.theme} disableTransitionOnChange>
          {children}
          <Toaster position="bottom-right" richColors closeButton theme={brand.theme} />
        </ThemeProvider>
      </body>
    </html>
  );
}
