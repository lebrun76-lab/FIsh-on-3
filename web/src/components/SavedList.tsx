"use client";
import Link from "next/link";
import { useAuth, FREE_FAV_LIMIT } from "@/lib/auth";
import type { SpotSummary } from "@/lib/summaries";
import { SpotCard } from "./SpotCard";
import { BRAND } from "@/lib/brand";
export function SavedList({ all }: { all: SpotSummary[] }) {
  const { user, favourites, home, setHome, plan, ready } = useAuth();
  if (!ready) return null;
  if (!user) return (
    <div className="pt-10 text-center space-y-3">
      <h1 className="text-2xl font-bold">Your spots, one tap away</h1>
      <p className="text-slate-600">Sign in to save a home spot and favourites, and get an email when they’re worth fishing.</p>
      <Link href="/signin?next=/saved" className="inline-block rounded-full bg-ocean-900 px-5 py-3 font-semibold text-white">Sign in free</Link>
    </div>
  );
  const mine = favourites.map((id) => all.find((s) => s.id === id)).filter(Boolean) as SpotSummary[];
  const homeSpot = mine.find((s) => s.id === home);
  return (
    <div className="pt-6 space-y-4">
      <div className="flex items-end justify-between"><h1 className="text-2xl font-bold">Saved spots</h1><span className="text-sm text-slate-500">{plan === "free" ? `${mine.length}/${FREE_FAV_LIMIT} on Free` : `${mine.length} saved`}</span></div>
      {homeSpot && (<div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Home spot</div><SpotCard s={homeSpot} /></div>)}
      <div className="grid gap-3 md:grid-cols-2">
        {mine.filter((s) => s.id !== home).map((s) => (
          <div key={s.id} className="space-y-1"><SpotCard s={s} /><button onClick={() => setHome(s.id)} className="text-xs text-ocean-700 pl-2">Make home spot</button></div>
        ))}
      </div>
      {!mine.length && <p className="text-slate-600">No saved spots yet. <Link className="text-ocean-700 font-semibold" href="/spots">Find one →</Link></p>}
      {plan === "free" && <Link href="/pricing" className="block rounded-2xl bg-ocean-100 p-4 text-sm text-ocean-900">Free saves 2 spots. Pro saves up to 5, plus the catch log, alerts and offline mode. <b>Try {BRAND.trialDays} days free, no card →</b></Link>}
    </div>
  );
}
