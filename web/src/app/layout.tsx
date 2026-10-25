import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { TopBar, BottomTabs } from "@/components/Nav";
import { MockBanner } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { SWRegister, OfflineIndicator } from "@/components/Offline";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  applicationName: BRAND.name,
  title: { default: `${BRAND.name} · NZ fishing forecasts in plain English`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  manifest: "/manifest.webmanifest",
  openGraph: { type: "website", siteName: BRAND.name, url: BRAND.url, title: `${BRAND.name} · NZ fishing forecasts in plain English`, description: BRAND.description, locale: "en_NZ" },
  twitter: { card: "summary", title: BRAND.name, description: BRAND.description },
  appleWebApp: { title: BRAND.shortName },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#06223a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NZ">
      <body className="min-h-screen antialiased font-sans">
        <AuthProvider>
          <SWRegister />
          <MockBanner />
          <OfflineIndicator />
          <TopBar />
          <main className="mx-auto max-w-5xl px-4 pb-24 md:pb-12">{children}</main>
          <footer className="mx-auto max-w-5xl px-4 pb-24 md:pb-8 text-xs text-slate-500">
            © {BRAND.name} · saltsupply.co.nz · Forecasts are guidance only. Always check the MetService marine forecast and local conditions before heading out. Weather & marine data: Open-Meteo (CC BY 4.0). Tides: LINZ (CC BY 4.0), not for navigation. No pop-ups, no autoplay, no intrusive ads. <a href="/about" className="underline">About</a>
          </footer>
          <BottomTabs />
        </AuthProvider>
      </body>
    </html>
  );
}
