import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "sonner";
import { brand } from "@/lib/branding";

const poppins = localFont({
  src: [
    { path: "./fonts/poppins/Poppins-300.ttf", weight: "300", style: "normal" },
    { path: "./fonts/poppins/Poppins-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/poppins/Poppins-500.ttf", weight: "500", style: "normal" },
    { path: "./fonts/poppins/Poppins-600.ttf", weight: "600", style: "normal" },
    { path: "./fonts/poppins/Poppins-700.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${brand.productName}`,
  description: brand.tagline,
  icons: { icon: "/favicon-32x32.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf5" },
    { media: "(prefers-color-scheme: dark)", color: "#252525" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${poppins.variable} font-sans antialiased bg-background text-foreground`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AppShell>{children}</AppShell>
          <Toaster position="bottom-right" richColors closeButton theme="system" />
        </ThemeProvider>
      </body>
    </html>
  );
}
