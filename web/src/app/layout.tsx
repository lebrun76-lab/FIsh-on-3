import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { TopBar, BottomTabs } from "@/components/Nav";
import { DemoBanner } from "@/components/DemoBanner";
import { demoMode } from "@/lib/demo";
import { BRAND } from "@/lib/brand";
import { SWRegister, OfflineIndicator } from "@/components/Offline";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  applicationName: BRAND.name,
  title: { default: `${BRAND.name} · Know when to fish`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website", siteName: BRAND.name, url: BRAND.url, title: `${BRAND.name} · Know when to fish`, description: BRAND.description, locale: "en_NZ",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: BRAND.name }],
  },
  twitter: { card: "summary_large_image", title: BRAND.name, description: BRAND.description, images: ["/og.png"] },
  appleWebApp: { title: BRAND.shortName },
  // Demo mode: keep it out of search results (also robots.txt and the X-Robots-Tag header in proxy.ts).
  ...(demoMode() ? { robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } } } : {}),
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1B2541" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NZ">
      <body className="min-h-screen antialiased font-sans">
        <AuthProvider>
          <SWRegister />
          <DemoBanner />
          <OfflineIndicator />
          <TopBar />
          <main className="mx-auto max-w-5xl px-4 pb-24 md:pb-12">{children}</main>
          <footer className="mx-auto max-w-5xl px-4 pb-24 md:pb-8 text-xs text-slate-500">
            © {BRAND.name} · saltsupply.co.nz · Forecasts are guidance only. Always check the MetService marine forecast and local conditions before heading out. Weather & marine data: Open-Meteo (CC BY 4.0). Tides: LINZ (CC BY 4.0), not for navigation. No pop-ups, no autoplay, no intrusive ads. <a href="/about" className="underline">About</a> · <a href="/credits" className="underline">Credits</a>
          </footer>
          <BottomTabs />
        </AuthProvider>
      </body>
    </html>
  );
}
