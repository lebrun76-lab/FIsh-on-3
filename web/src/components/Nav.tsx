"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { useAuth } from "@/lib/auth";

const TABS = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/where-to-go", label: "Where to go", icon: "➚" },
  { href: "/spots", label: "Spots", icon: "⌕" },
  { href: "/rules", label: "Rules", icon: "⚑" },
  { href: "/saved", label: "Saved", icon: "★" },
];
const DESKTOP = [...TABS.slice(1), { href: "/species", label: "Species", icon: "" }, { href: "/pricing", label: "Pricing", icon: "" }, { href: "/account", label: "Account", icon: "" }];
const planLabel = (p: string) => (p === "pro" ? "Pro" : p === "trial" ? "Pro trial" : "Free");
export function TopBar() {
  const { user, plan } = useAuth();
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 bg-ocean-950 text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-extrabold tracking-tight">{BRAND.name}</Link>
        <nav className="hidden md:flex items-center gap-5 text-sm">
          {DESKTOP.map((t) => (
            <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? "text-white font-semibold" : "text-ocean-100/80 hover:text-white"}>{t.label}</Link>
          ))}
          {user ? <span className="rounded-full bg-ocean-700 px-3 py-1 text-xs">{user.name} · {planLabel(plan)}</span>
            : <Link href="/signin" className="rounded-full bg-white px-4 py-1.5 font-semibold text-ocean-950">Sign in</Link>}
        </nav>
        {!user && <Link href="/signin" className="md:hidden rounded-full bg-white px-3 py-1 text-sm font-semibold text-ocean-950">Sign in</Link>}
        {user && <Link href="/account" className="md:hidden rounded-full bg-ocean-700 px-2.5 py-1 text-xs">{planLabel(plan)}</Link>}
      </div>
    </header>
  );
}
export function BottomTabs() {
  const path = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`flex flex-col items-center py-2 text-xs ${active ? "text-ocean-700 font-semibold" : "text-slate-500"}`}>
              <span className="text-lg leading-none">{t.icon}</span>{t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
