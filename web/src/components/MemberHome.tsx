"use client";
// The signed-in home: the shaded island map, then the saved spots. No selling.
import Link from "next/link";
import { useState } from "react";
import { useAuth, isPaid } from "@/lib/auth";
import type { SpotSummary } from "@/lib/summaries";
import { SpotMap } from "./SpotMap";
import { RatingBadge } from "./ui";

type Island = "North" | "South";

export function MemberHome({ all }: { all: SpotSummary[] }) {
  const { ready, user, plan, favourites, home } = useAuth();
  const [pick, setPick] = useState<Island | null>(null);
  if (ready && !user) return null;
  const homeIsland = (all.find((s) => s.id === (home ?? favourites[0]))?.island as Island | undefined) ?? "North";
  const island = pick ?? homeIsland;
  const pro = isPaid(plan);
  const mine = favourites.map((id) => all.find((s) => s.id === id)).filter((s): s is SpotSummary => !!s);
  return (
    <div className="space-y-4 pt-3">
      <h1 className="sr-only">Your fishing map</h1>
      <div role="group" aria-label="Island" className="flex gap-1.5">
        {(["North", "South"] as const).map((i) => (
          <button key={i} type="button" onClick={() => setPick(i)} aria-pressed={island === i}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${island === i ? "bg-ocean-900 text-white ring-ocean-900" : "bg-white text-slate-700 ring-slate-200"}`}>{i} Island</button>
        ))}
      </div>
      {ready ? <SpotMap spots={all} island={island} favourites={favourites} tall days={pro ? 7 : 1} /> : <div className="h-[calc(100svh-17rem)] min-h-[440px] max-h-[820px] rounded-2xl bg-white/60 ring-1 ring-slate-200" />}
      {ready && (
        <section aria-labelledby="saved-h" className="space-y-2">
          <h2 id="saved-h" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your spots</h2>
          {!mine.length ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
              <p className="text-slate-700">No saved spots yet.</p>
              <Link href="/welcome" className="shrink-0 rounded-full bg-ocean-900 px-4 py-2 text-sm font-semibold text-white">Pick your spots</Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
              {mine.map((s) => {
                const c = pro ? { rating: s.rating, score: s.score, headline: s.best ?? s.headline } : s.day;
                const nums = [s.nums.wind, s.nums.sea, s.nums.tide].filter(Boolean).join(" · ");
                return (
                  <li key={s.id}>
                    <Link href={`/spots/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-slate-900">{s.name}{s.id === home && <span className="ml-1.5 text-xs font-normal text-slate-400">home</span>}</div>
                        <div className="truncate text-sm text-slate-700">{c.headline}</div>
                        {nums && <div className="truncate text-xs text-slate-500">{nums}</div>}
                      </div>
                      <RatingBadge rating={c.rating} score={c.score} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {!pro && <p className="px-1 text-xs text-slate-500">Free shows today. Pro looks up to 10 days ahead. <Link href="/pricing" className="underline">Pro</Link></p>}
        </section>
      )}
    </div>
  );
}
