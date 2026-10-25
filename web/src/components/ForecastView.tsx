"use client";
import Link from "next/link";
import type { SpotForecast } from "@/lib/types";
import { useAuth, isPaid } from "@/lib/auth";
import { RatingBadge, RATING_STYLE } from "./ui";
import { FavButton } from "./FavButton";
import { Locked } from "./Locked";
import { OfflineButton } from "./Offline";
import { WindChart, SwellChart, TideChart, SstChart } from "./Charts";
import { clock, dateLabel, dayShort } from "@/lib/time";
import { safetyCheck } from "@/lib/safety";
import { CLOSURES, speciesFor, sizeText } from "@/lib/rules";

const SAFETY = { ok: ["bg-emerald-50 ring-emerald-200 text-emerald-900", "✅ Safe to go"], caution: ["bg-amber-50 ring-amber-200 text-amber-900", "⚠️ Take care"], no: ["bg-rose-50 ring-rose-200 text-rose-900", "⛔ Not safe for small boats"] } as const;

export function ForecastView({ f }: { f: SpotForecast }) {
  const { plan } = useAuth();
  const pro = isPaid(plan);
  const today = f.days[0].date;
  const days = pro ? f.days : f.days.slice(0, 1);
  const hourly = f.hourly.slice(0, days.length * 24);
  const windows = pro ? f.windows : f.windows.filter((w) => w.start.slice(0, 10) === today);
  const todayWin = f.windows.filter((w) => w.start.slice(0, 10) === today).sort((a, b) => b.score - a.score)[0];
  const species = speciesFor(f.spot.species);
  const v = pro ? f.verdict : todayWin
    ? { ...f.verdict, rating: todayWin.rating, score: todayWin.score, headline: `Go today, ${clock(todayWin.start)}–${clock(todayWin.end)}`, advice: `${todayWin.reasons.slice(0, 2).join(", ")}. ${todayWin.advice}` }
    : { ...f.verdict, rating: f.days[0].rating, score: f.days[0].score, headline: f.days[0].score >= 4.5 ? "Fishable today, nothing special" : "Give today a miss", advice: `${f.days[0].summary}.` };
  const rs = RATING_STYLE[v.rating];
  const call = `${v.headline.startsWith("Go") ? v.headline : v.headline + "."} ${f.spot.species.slice(0, 2).join("/").toLowerCase()}${species[0] ? ` · ${species[0].name.toLowerCase()} ${sizeText(species[0])}` : ""}`;
  const near = CLOSURES.filter((c) => Math.hypot(c.lat - f.spot.lat, c.lon - f.spot.lon) < 1.2);
  const safety = safetyCheck(f.hourly.slice(0, 24), f.spot.coastal);
  return (
    <div className="space-y-5 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/spots" className="text-sm text-ocean-700">← All spots</Link>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">{f.spot.name}</h1>
          <p className="text-sm text-slate-500">{f.spot.region} · {f.spot.island} Island{f.spot.coastal ? "" : " · freshwater"}</p>
        </div>
        <FavButton id={f.spot.id} />
      </div>

      {/* 1. The call — plain English first */}
      <section className={`rounded-3xl bg-white p-5 md:p-7 shadow-sm ring-2 ${rs.ring}`}>
        <div className="flex items-center gap-2"><RatingBadge rating={v.rating} score={v.score} size="lg" /><span className="text-xs text-slate-500">{pro ? "Best in the next 10 days" : "Today"} · confidence {v.confidence}</span></div>
        <h2 className={`mt-3 text-2xl md:text-3xl font-extrabold ${rs.text}`}>{v.headline}</h2>
        <p className="mt-2 text-lg text-slate-700 leading-snug">{v.advice}</p>
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700"><b>The call:</b> {call}</p>
        {!pro && f.windows[0] && f.windows[0].start.slice(0, 10) !== today && <p className="mt-2 text-sm text-ocean-900">🔭 A <b>{f.windows[0].rating}</b> window shows up later this week — <Link href="/pricing" className="underline">see it with Pro</Link>.</p>}
      </section>

      {/* 2. Safety check (always free) */}
      <section className={`rounded-2xl p-4 ring-1 ${SAFETY[safety.level][0]}`}>
        <div className="font-bold">{SAFETY[safety.level][1]} today</div>
        <p className="text-sm">{safety.text}</p>
        <p className="mt-1 text-xs opacity-70">Combined wind + swell check. Always check the MetService marine forecast and tell someone your plans.</p>
      </section>

      {/* 3. Windows */}
      <section>
        <h2 className="mb-2 text-lg font-bold">{pro ? "Best fishing windows" : "Best window today"}</h2>
        {windows.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {windows.slice(0, pro ? 4 : 1).map((w) => (
              <div key={w.start} className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
                <div className="flex items-center justify-between"><span className="font-semibold">{dayShort(w.start)} {clock(w.start)}–{clock(w.end)}</span><RatingBadge rating={w.rating} score={w.score} /></div>
                <p className="mt-1 text-sm text-slate-600">{w.advice}</p>
                <div className="mt-2 flex flex-wrap gap-1">{w.reasons.map((r) => <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{r}</span>)}</div>
              </div>
            ))}
          </div>
        ) : <p className="rounded-2xl bg-white p-4 text-slate-600 ring-1 ring-slate-100">No standout window today. Forecasts update every few hours.</p>}
      </section>

      {/* 4. Outlook */}
      <section>
        <h2 className="mb-2 text-lg font-bold">{pro ? "10-day outlook" : "Outlook"}</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
          {f.days.map((d, i) => {
            const open = pro || i === 0;
            const s = safetyCheck(f.hourly.slice(i * 24, i * 24 + 24), f.spot.coastal);
            return open ? (
              <div key={d.date} className="snap-start min-w-[8.5rem] rounded-2xl bg-white p-3 ring-1 ring-slate-100">
                <div className="text-sm font-semibold">{i === 0 ? "Today" : dateLabel(d.date)}</div>
                <div className="my-1"><RatingBadge rating={d.rating} score={d.score} /></div>
                <div className="text-xs text-slate-600">{d.summary}</div>
                <div className="mt-1 text-xs text-slate-500">{s.level === "ok" ? "✅" : s.level === "caution" ? "⚠️" : "⛔"} {d.wind_kn_avg} kn{d.swell_m_avg !== null ? ` · ${d.swell_m_avg} m` : ""}</div>
              </div>
            ) : (
              <Link href="/pricing" key={d.date} className="snap-start min-w-[8.5rem] rounded-2xl bg-slate-100 p-3 text-slate-500 ring-1 ring-slate-200">
                <div className="text-sm font-semibold">{dateLabel(d.date)}</div>
                <div className="my-1 h-5 w-14 rounded-full bg-slate-300/70" />
                <div className="text-xs">🔒 Pro</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 5. Data second */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">The detail {pro ? "" : <span className="text-sm font-normal text-slate-500">(today)</span>}</h2>
        {f.spot.coastal && <div className="flex flex-wrap gap-2 text-sm">{f.tides.slice(0, 4).map((t) => <span key={t.time} className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-100">{t.type === "high" ? "▲ High" : "▼ Low"} {dayShort(t.time)} {clock(t.time)}</span>)}</div>}
        <div className="grid gap-3 md:grid-cols-2">
          <WindChart data={hourly} />
          {f.spot.coastal && <SwellChart data={hourly} />}
          {f.spot.coastal && <TideChart data={pro ? hourly : f.hourly.slice(0, 48)} />}
          {f.spot.coastal && (pro ? (
            <div className="space-y-2">
              <SstChart data={hourly} />
              <div className="rounded-2xl bg-orange-50 p-3 text-sm text-orange-900 ring-1 ring-orange-100"><b>Sea temp & current breaks:</b> water is around {f.days[0].sst_c_avg}°C. A warmer edge (+0.8°C) sits about 4 km offshore to the north-east — work along that line; baitfish and kingfish often hold on it. <span className="text-xs opacity-70">(mock)</span></div>
            </div>
          ) : <Locked title="Sea temperature & current breaks" body="Plain-English read of where the warm water and current lines are, and why it matters for snapper and kings." />)}
        </div>
        {!f.spot.coastal && <p className="text-sm text-slate-500">Freshwater spot: swell, tide and sea temperature don’t apply.</p>}
      </section>

      {/* 6. Rules — always free */}
      <section className="space-y-2">
        <div className="flex items-end justify-between"><h2 className="text-lg font-bold">Rules here</h2><Link href="/rules" className="text-sm font-semibold text-ocean-700">Rules map →</Link></div>
        <div className="grid gap-2 md:grid-cols-2">
          {species.map((s) => (
            <div key={s.id} className="rounded-2xl bg-white p-3 ring-1 ring-slate-100 text-sm">
              <div className="font-semibold">{s.name}{s.maori ? ` · ${s.maori}` : ""}</div>
              <div className="text-slate-600">{s.minSizeCm ? `Min ${s.minSizeCm} cm` : "No min size"} · {s.dailyBag ? `bag ${s.dailyBag}/day` : "see local rules"}</div>
            </div>
          ))}
        </div>
        {near.map((c) => <div key={c.id} className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-100">⛔ <b>{c.name}</b> ({c.type}): {c.rule}</div>)}
        <p className="text-xs text-slate-400">Sample rules for the prototype — not verified. Production pulls from MPI / DOC with a “last checked” date.</p>
      </section>

      {/* 7. Pro tools */}
      <section className="grid gap-3 md:grid-cols-2">
        <OfflineButton spotId={f.spot.id} pro={pro} />
        {pro ? <Link href="/catch-log" className="rounded-2xl bg-white p-4 ring-1 ring-slate-100"><div className="font-semibold">📒 Log a catch here</div><div className="text-sm text-slate-600">Species, size, photo — matched to the conditions automatically.</div></Link>
          : <Locked compact title="Catch log" body="Log what you caught and see which conditions work at your spots." />}
      </section>
      <p className="text-xs text-slate-400">{f.sources.join(" · ")}</p>
    </div>
  );
}
