import Link from "next/link";
import { allSummaries, regionCalls } from "@/lib/summaries";
import { CallCard } from "@/components/WhereToGo";
import { SpotCard } from "@/components/SpotCard";
import { BRAND } from "@/lib/brand";
import { Photo } from "@/components/ui";
import { HOME_HERO } from "@/lib/photos";

export default function Home() {
  const top = allSummaries().sort((a, b) => b.score - a.score).slice(0, 4);
  const calls = regionCalls().slice(0, 3);
  return (
    <div className="space-y-8 pt-6">
      <section className="grid gap-4 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">NZ fishing forecast</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-extrabold leading-tight text-ocean-950">{BRAND.tagline}</h1>
          <p className="mt-3 max-w-xl text-slate-600">Wind, swell, tide and water temp for {allSummaries().length} spots around the country, boiled down to go, maybe, or stay home. And the best few hours to be out there.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/spots" className="rounded-full bg-ocean-900 px-5 py-3 font-semibold text-white">Check a spot</Link>
            <Link href="/where-to-go" className="rounded-full px-5 py-3 font-semibold text-ocean-900 ring-1 ring-ocean-900/30">Where to go</Link>
          </div>
        </div>
        <Photo p={HOME_HERO} ratio="3 / 2" preload sizes="(min-width: 1024px) 496px, (min-width: 768px) 50vw, 100vw" />
      </section>
      <section>
        <div className="mb-3 flex items-end justify-between"><h2 className="text-xl font-bold">Best bets, next 3 days</h2><Link href="/where-to-go" className="text-sm text-ocean-700 font-semibold">All regions →</Link></div>
        <div className="grid gap-3 md:grid-cols-3">{calls.map((c) => <CallCard key={c.region} c={c} />)}</div>
      </section>
      <section className="grid gap-3 md:grid-cols-4 text-sm">
        {[["Safety check", "Wind and waves together: fine, take care, or stay home."], ["Rules on a map", "Reserves, closures and legal sizes. Always free."], ["Works offline", "Save a forecast before you lose signal at the ramp."], ["No pop-ups", `${BRAND.trialDays}-day Pro trial. No card.`]].map(([t, d]) => (
          <div key={t} className="rounded-2xl bg-white p-4 ring-1 ring-slate-100"><div className="font-semibold">{t}</div><div className="text-slate-600">{d}</div></div>
        ))}
      </section>
      <section>
        <div className="mb-3 flex items-end justify-between"><h2 className="text-xl font-bold">Spots to watch</h2><Link href="/spots" className="text-sm text-ocean-700 font-semibold">All spots →</Link></div>
        <div className="grid gap-3 md:grid-cols-2">{top.map((s) => <SpotCard key={s.id} s={s} />)}</div>
      </section>
      <section className="grid gap-3 md:grid-cols-3">
        {[["1. Save your spot", "Your home spot, plus any others you fish."], ["2. Read the call", "The answer first. Charts underneath if you want them."], ["3. Get an email", "We'll email you when a good window's coming up."]].map(([t, d]) => (
          <div key={t} className="rounded-2xl bg-white p-5 ring-1 ring-slate-100"><div className="font-semibold">{t}</div><div className="text-sm text-slate-600">{d}</div></div>
        ))}
      </section>
    </div>
  );
}

export const revalidate = 1800; // ISR: refresh forecasts every 30 min
