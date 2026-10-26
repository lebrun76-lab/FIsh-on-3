"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";

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
    <header className="sticky top-0 z-30 border-b border-salt-navy/10 bg-sand-50/95 text-salt-navy backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
        <Link href="/" aria-label={`${BRAND.name} home`} className="shrink-0"><Logo className="block h-9 w-auto md:h-10" /></Link>
        <nav className="hidden md:flex items-center gap-5 text-sm">
          {DESKTOP.map((t) => (
            <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? "text-salt-navy font-semibold" : "text-salt-navy/70 hover:text-salt-navy"}>{t.label}</Link>
          ))}
          {user ? <span className="rounded-full bg-salt-navy px-3 py-1 text-xs text-white">{user.name} · {planLabel(plan)}</span>
            : <Link href="/signin" className="rounded-full bg-salt-navy px-4 py-1.5 font-semibold text-white">Sign in</Link>}
        </nav>
        {!user && <Link href="/signin" className="md:hidden rounded-full bg-salt-navy px-3 py-1 text-sm font-semibold text-white">Sign in</Link>}
        {user && <Link href="/account" className="md:hidden rounded-full bg-salt-navy px-2.5 py-1 text-xs text-white">{planLabel(plan)}</Link>}
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
