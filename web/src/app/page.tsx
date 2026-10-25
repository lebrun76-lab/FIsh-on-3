import Link from "next/link";
import { allSummaries, regionCalls } from "@/lib/summaries";
import { CallCard } from "@/components/WhereToGo";
import { SpotCard } from "@/components/SpotCard";
import { BRAND } from "@/lib/brand";

export default function Home() {
  const top = allSummaries().sort((a, b) => b.score - a.score).slice(0, 4);
  const calls = regionCalls().slice(0, 3);
  return (
    <div className="space-y-8 pt-6">
      <section className="rounded-3xl bg-gradient-to-br from-ocean-900 to-ocean-700 p-6 md:p-10 text-white">
        <p className="text-sm uppercase tracking-widest text-ocean-100/80">NZ fishing forecast</p>
        <h1 className="mt-2 text-3xl md:text-5xl font-extrabold leading-tight">{BRAND.tagline}</h1>
        <p className="mt-3 max-w-xl text-ocean-100">Wind, swell, tides and sea temperature turned into one simple answer: is it worth going, and when?</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/spots" className="rounded-full bg-white px-5 py-3 font-semibold text-ocean-950">Check my spot</Link>
          <Link href="/where-to-go" className="rounded-full px-5 py-3 font-semibold ring-1 ring-white/50">Where to go today</Link>
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-end justify-between"><h2 className="text-xl font-bold">Next fishing day’s calls</h2><Link href="/where-to-go" className="text-sm text-ocean-700 font-semibold">All regions →</Link></div>
        <div className="grid gap-3 md:grid-cols-3">{calls.map((c) => <CallCard key={c.region} c={c} />)}</div>
      </section>
      <section className="grid gap-3 md:grid-cols-4 text-sm">
        {[["✅ Safety check", "Wind + swell combined into one go / careful / stay home."], ["⚑ Rules on a map", "Reserves, closures and legal sizes — always free."], ["📶 Works offline", "Save forecasts for the boat ramp with no signal."], ["🙅 No intrusive ads", `Honest ${BRAND.trialDays}-day Pro trial, no card needed.`]].map(([t, d]) => (
          <div key={t} className="rounded-2xl bg-white p-4 ring-1 ring-slate-100"><div className="font-semibold">{t}</div><div className="text-slate-600">{d}</div></div>
        ))}
      </section>
      <section>
        <div className="mb-3 flex items-end justify-between"><h2 className="text-xl font-bold">Spots to watch</h2><Link href="/spots" className="text-sm text-ocean-700 font-semibold">All spots →</Link></div>
        <div className="grid gap-3 md:grid-cols-2">{top.map((s) => <SpotCard key={s.id} s={s} />)}</div>
      </section>
      <section className="grid gap-3 md:grid-cols-3">
        {[["1. Pick your spots", "Save your home spot and favourites."], ["2. Read the verdict", "Plain-English advice first. Charts if you want the detail."], ["3. Get the nod", "We email you when a good fishing window is coming."]].map(([t, d]) => (
          <div key={t} className="rounded-2xl bg-white p-5 ring-1 ring-slate-100"><div className="font-semibold">{t}</div><div className="text-sm text-slate-600">{d}</div></div>
        ))}
      </section>
    </div>
  );
}

export const revalidate = 1800; // ISR: refresh forecasts every 30 min
