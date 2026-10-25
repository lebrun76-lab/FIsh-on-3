"use client";
import Link from "next/link";
import type { HourPoint, SpotForecast } from "@/lib/types";
import { useAuth, isPaid } from "@/lib/auth";
import { RatingBadge, RATING_STYLE } from "./ui";
import { FavButton } from "./FavButton";
import { Locked } from "./Locked";
import { OfflineButton } from "./Offline";
import { WindChart, SwellChart, TideChart, SstChart } from "./Charts";
import { clock, dateLabel, dayShort, nzTodayISO } from "@/lib/time";
import { safetyCheck } from "@/lib/safety";
import { CLOSURES, speciesFor, sizeText } from "@/lib/rules";

const SAFETY = { ok: ["bg-emerald-50 ring-emerald-200 text-emerald-900", "✅ Safe to go"], caution: ["bg-amber-50 ring-amber-200 text-amber-900", "⚠️ Take care"], no: ["bg-rose-50 ring-rose-200 text-rose-900", "⛔ Not safe for small boats"] } as const;

export function ForecastView({ f }: { f: SpotForecast }) {
  const { plan } = useAuth();
  const pro = isPaid(plan);
  // "Today" = the next day with fishable daylight. Late at night the engine
  // returns score=null for the calendar day ("No daylight left today").
  const realToday = nzTodayISO();
  const di = Math.max(0, f.days.findIndex((d) => d.score !== null));
  const d0 = f.days[di];
  const today = d0.date;
  const todayWord = today === realToday ? "today" : dayShort(today);
  const days = pro ? f.days : [d0];
  const dates = new Set(days.map((d) => d.date));
  const hourly = f.hourly.filter((h) => dates.has(h.time.slice(0, 10)));
  const dayHours = (date: string) => f.hourly.filter((h) => h.time.slice(0, 10) === date);
  const tideData: HourPoint[] = f.tide_series?.length
    ? f.tide_series.filter((t) => pro || t.time.slice(0, 10) <= today).map((t) => ({ time: t.time, tide_m: t.height_m, wind_kn: null, gust_kn: null, wind_dir_deg: null, swell_m: null, swell_period_s: null, sst_c: null, rain_mm: null, score: null }))
    : (pro ? hourly : f.hourly.slice(0, 48));
  const windows = pro ? f.windows : f.windows.filter((w) => w.start.slice(0, 10) === today);
  const todayWin = f.windows.filter((w) => w.start.slice(0, 10) === today).sort((a, b) => b.score - a.score)[0];
  const engineSpecies = d0.species ?? [];
  const closed = engineSpecies.filter((x) => x.status === "closed");
  const targets = engineSpecies.filter((x) => x.status !== "closed").map((x) => x.name);
  const species = speciesFor(f.spot.species);
  const tgt = speciesFor(targets.length ? targets : f.spot.species);
  const v = pro ? f.verdict : todayWin
    ? { ...f.verdict, rating: todayWin.rating, score: todayWin.score, headline: `Go ${todayWord}, ${clock(todayWin.start)}–${clock(todayWin.end)}`, advice: todayWin.advice, confidence: todayWin.confidence ?? f.verdict.confidence }
    : { ...f.verdict, rating: d0.rating, score: d0.score ?? 0, headline: (d0.score ?? 0) >= 4.5 ? `Fishable ${todayWord}, nothing special` : `Give ${todayWord} a miss`, advice: `${d0.best_window_text ?? d0.summary}.` };
  const mock = f.data_status === "mock-fallback";
  const rs = RATING_STYLE[v.rating];
  const call = `${v.headline.startsWith("Go") ? v.headline : v.headline + "."} ${(targets.length ? targets : f.spot.species).slice(0, 2).join("/").toLowerCase()}${tgt[0] ? ` · ${tgt[0].name.toLowerCase()} ${sizeText(tgt[0])}` : ""}`;
  const near = CLOSURES.filter((c) => Math.hypot(c.lat - f.spot.lat, c.lon - f.spot.lon) < 1.2);
  const safety = safetyCheck(dayHours(today), f.spot.coastal);
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

      {mock ? (
        <div className="rounded-2xl bg-yellow-100 p-3 text-sm text-yellow-950 ring-2 ring-yellow-400"><b>⚠️ MOCK FALLBACK — not a real forecast.</b> {f.fallback_reason} Numbers below are generated placeholders.</div>
      ) : (
        <div className={`rounded-xl px-3 py-2 text-xs ring-1 ${f.stale ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-white text-slate-500 ring-slate-100"}`}>
          {f.stale ? "⚠️ Forecast is more than 6 hours old · " : ""}Forecast Brain v{f.engine_version} · generated {dayShort(f.generated_at)} {clock(f.generated_at)} NZ time{f.spot.coastal && f.tide_source ? ` · tides: ${f.tide_source}` : ""}
          {f.warnings?.map((w) => <div key={w}>⚠️ {w}</div>)}
        </div>
      )}

      {/* 1. The call — plain English first */}
      <section className={`rounded-3xl bg-white p-5 md:p-7 shadow-sm ring-2 ${rs.ring}`}>
        <div className="flex items-center gap-2"><RatingBadge rating={v.rating} score={v.score} size="lg" /><span className="text-xs text-slate-500">{pro ? `Best in the next ${f.days.length} days` : today === realToday ? "Today" : `Next fishing day · ${dateLabel(today)}`} · confidence {v.confidence}</span></div>
        <h2 className={`mt-3 text-2xl md:text-3xl font-extrabold ${rs.text}`}>{v.headline}</h2>
        <p className="mt-2 text-lg text-slate-700 leading-snug">{v.advice}</p>
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700"><b>The call:</b> {call}</p>
        {!pro && f.windows[0] && f.windows[0].start.slice(0, 10) !== today && <p className="mt-2 text-sm text-ocean-900">🔭 A <b>{f.windows[0].rating}</b> window shows up later this week — <Link href="/pricing" className="underline">see it with Pro</Link>.</p>}
      </section>

      {/* 2. Safety check (always free) */}
      <section className={`rounded-2xl p-4 ring-1 ${SAFETY[safety.level][0]}`}>
        <div className="font-bold">{SAFETY[safety.level][1]} {todayWord}</div>
        <p className="text-sm">{safety.text}</p>
        <p className="mt-1 text-xs opacity-70">Combined wind + swell check. Always check the MetService marine forecast and tell someone your plans.</p>
      </section>

      {/* 3. Windows */}
      <section>
        <h2 className="mb-2 text-lg font-bold">{pro ? "Best fishing windows" : `Best window ${todayWord}`}</h2>
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
        ) : <p className="rounded-2xl bg-white p-4 text-slate-600 ring-1 ring-slate-100">No standout window {todayWord}. Forecasts update every few hours.</p>}
      </section>

      {/* 4. Outlook */}
      <section>
        <h2 className="mb-2 text-lg font-bold">{pro ? `${f.days.length}-day outlook` : "Outlook"}</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
          {f.days.map((d, i) => {
            const open = pro || i <= di;
            const s = safetyCheck(dayHours(d.date), f.spot.coastal);
            return open ? (
              <div key={d.date} className="snap-start min-w-[8.5rem] rounded-2xl bg-white p-3 ring-1 ring-slate-100">
                <div className="text-sm font-semibold">{d.date === realToday ? "Today" : dateLabel(d.date)}</div>
                <div className="my-1">{d.score === null ? <span className="text-xs text-slate-400">—</span> : <RatingBadge rating={d.rating} score={d.score} />}</div>
                <div className="text-xs text-slate-600">{d.summary}</div>
                {d.score !== null && <div className="mt-1 text-xs text-slate-500">{s.level === "ok" ? "✅" : s.level === "caution" ? "⚠️" : "⛔"} {d.wind_kn_avg} kn{d.swell_m_avg !== null ? ` · ${d.swell_m_avg} m` : ""}{d.sst_c_avg !== null ? ` · ${d.sst_c_avg}°C` : ""}</div>}
                {d.confidence && d.score !== null && <div className="text-[10px] uppercase tracking-wide text-slate-400">{d.confidence} confidence</div>}
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
        {f.spot.coastal && <div className="flex flex-wrap gap-2 text-sm">{f.tides.filter((t) => t.time.slice(0, 10) >= today).slice(0, 4).map((t) => <span key={t.time} className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-100">{t.type === "high" ? "▲ High" : "▼ Low"} {dayShort(t.time)} {clock(t.time)} · {t.height_m} m</span>)}</div>}
        {f.spot.coastal && f.tide_datum && <p className="text-xs text-slate-500">Tide heights: {f.tide_datum}. {f.spot.tide_note ? `${f.spot.tide_note.replace(/\.?$/, ".")} ` : ""}Not for navigation.</p>}
        {!pro && <p className="text-xs text-slate-500">Charts show {dateLabel(today)}{f.hourly_step_h ? ` in ${f.hourly_step_h}-hour steps` : ""}.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <WindChart data={hourly} />
          {f.spot.coastal && <SwellChart data={hourly} />}
          {f.spot.coastal && <TideChart data={tideData} />}
          {f.spot.coastal && (pro ? (
            <div className="space-y-2">
              <SstChart data={hourly} />
              <div className="rounded-2xl bg-orange-50 p-3 text-sm text-orange-900 ring-1 ring-orange-100"><b>Sea temp:</b> around {d0.sst_c_avg}°C ({mock ? "mock" : "Open-Meteo model"}). <b>Current breaks:</b> not built yet — the warm-edge read here is still a placeholder. <span className="text-xs opacity-70">(mock)</span></div>
            </div>
          ) : <Locked title="Sea temperature & current breaks" body="Plain-English read of where the warm water and current lines are, and why it matters for snapper and kings." />)}
        </div>
        {!f.spot.coastal && <p className="text-sm text-slate-500">Freshwater spot: swell, tide and sea temperature don’t apply.</p>}
      </section>

      {/* 5b. Species this week — engine (sourced) */}
      {engineSpecies.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">What’s on {todayWord}</h2>
          {closed.map((c) => <div key={c.name} className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-100">⛔ <b>{c.name} — closed.</b> {c.notes[0]}</div>)}
          <div className="grid gap-2 md:grid-cols-2">
            {engineSpecies.filter((x) => x.status !== "closed").slice(0, pro ? 8 : 3).map((x) => (
              <div key={x.name} className="rounded-2xl bg-white p-3 text-sm ring-1 ring-slate-100">
                <div className="flex items-center justify-between"><b>{x.name}</b><span className={`rounded-full px-2 py-0.5 text-xs ${x.status === "peak" ? "bg-emerald-100 text-emerald-800" : x.status === "in season" ? "bg-lime-100 text-lime-800" : "bg-slate-100 text-slate-600"}`}>{x.status}</span></div>
                <div className="text-slate-600">{x.how}</div>
                {x.notes[0] && <div className="mt-1 text-xs text-slate-500">{x.notes[0]}</div>}
                {x.sources.length > 0 && <div className="mt-1 text-[10px] text-slate-400">Source: {x.sources[0].split(". http")[0]}</div>}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">Seasons and closures from Forecast Brain’s sourced species table{d0.moon ? ` · moon: ${d0.moon.phase}, ${d0.moon.illumination_pct}%` : ""}.</p>
        </section>
      )}

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
        <p className="text-xs text-slate-400">Sizes, bag limits and the closure map above are still SAMPLE data — not verified. Production pulls from MPI / DOC with a “last checked” date.</p>
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
