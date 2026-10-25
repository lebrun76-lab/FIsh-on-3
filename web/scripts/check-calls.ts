// Consistency check: every badge must match the call it sits next to.
// Run: npx tsx scripts/check-calls.ts [ISO time ...]
// Each forecast is checked as loaded AND with the feat/windows-and-copy fields stripped
// (near_best, score_remaining, remaining_from, score_full_day), so older output keeps working.
import { allSummaries, regionCalls } from "../src/lib/summaries";
import { allForecasts } from "../src/lib/forecasts";
import { bestCall, dayScore, isNearBest, listsAllWindows, ratingFor, todayStale } from "../src/lib/call";
import { nzTodayISO } from "../src/lib/time";
import type { FishingWindow, SpotForecast } from "../src/lib/types";

const DASH = /—| [-–] /;                       // no em dashes, no spaced dashes
const HYPE = /\b(unlock|elevate|revolutioni[sz]e|AI[- ]powered|game[- ]chang|supercharge|seamless)/i;
const copyProbs = (where: string, s: string) => [DASH.test(s) ? `${where}: dash "${s}"` : "", HYPE.test(s) ? `${where}: hype "${s}"` : ""].filter(Boolean);

const stripW = (w: FishingWindow | null | undefined) => { if (!w) return w; const { near_best: _n, ...rest } = w; return rest as FishingWindow; };
const legacy = (f: SpotForecast): SpotForecast => ({
  ...f,
  windows: f.windows.map((w) => stripW(w)!),
  days: f.days.map(({ score_remaining: _a, remaining_from: _b, score_full_day: _c, ...d }) => ({ ...d, best_window: stripW(d.best_window), least_bad_window: stripW(d.least_bad_window) })),
});

const real = Date.now;
const times = process.argv.slice(2);
let bad = 0;
for (const t of times.length ? times : [new Date().toISOString()]) {
  const at = Date.parse(t); Date.now = () => at;
  const probs: string[] = [];
  for (const s of allSummaries()) {
    const none = s.headline.startsWith("No fishable");
    if (none ? s.rating !== "poor" : s.rating !== ratingFor(s.score)) probs.push(`summary ${s.id}: ${s.rating} ${s.score} "${s.headline}"`);
    probs.push(...copyProbs(`summary ${s.id}`, s.headline));
  }
  for (const c of regionCalls()) {
    if (c.fishable ? c.rating !== ratingFor(c.score) || !/^(Go|Best chance)/.test(c.call) : c.rating !== "poor" || !c.call.startsWith("Give")) probs.push(`region ${c.region}: ${c.rating} ${c.score} "${c.call}"`);
    if (/!/.test(c.call)) probs.push(`region ${c.region}: punctuation "${c.call}"`);
    probs.push(...copyProbs(`region ${c.region}`, c.call));
  }
  let fresh = 0, also = 0;
  const today = nzTodayISO();
  for (const f0 of allForecasts()) {
    if (listsAllWindows(f0)) fresh++;
    probs.push(...copyProbs(`verdict ${f0.spot.id}`, f0.verdict.advice), ...f0.windows.flatMap((w) => copyProbs(`window ${f0.spot.id} ${w.start}`, `${w.headline} ${w.advice}`)), ...f0.days.flatMap((d) => copyProbs(`day ${f0.spot.id} ${d.date}`, d.summary)));
    for (const [tag, f] of [["", f0], [" (legacy)", legacy(f0)]] as const) for (const sc of ["day", "horizon"] as const) {
      const c = bestCall(f, sc), id = `spot ${f.spot.id}${tag} ${sc}`;
      if (c.kind === "window" && (c.rating !== ratingFor(c.score) || c.score < 4.5 || Date.parse(c.end!) <= at)) probs.push(`${id}: ${c.rating} ${c.score} ${c.headline}`);
      if (c.kind === "none" && c.also.length) probs.push(`${id}: 'also' without a pick`);
      for (const w of c.also) {
        if (w.start === c.start || w.score < 4.5 || Date.parse(w.end) <= at || w.start.slice(0, 10) !== c.date || !isNearBest(f, w)) probs.push(`${id}: bad 'also' ${w.start} ${w.score}`);
      }
      if (!tag) also += c.also.length;
      probs.push(...copyProbs(id, c.headline));
    }
    // legacy near_best fallback must agree with the engine's flag
    for (const w of f0.windows) if (typeof w.near_best === "boolean" && isNearBest(legacy(f0), stripW(w)!) !== w.near_best) probs.push(`spot ${f0.spot.id}: near_best fallback disagrees at ${w.start}`);
    // today's shown score: score_remaining, else score
    const d = f0.days.find((x) => x.date === today);
    if (d && dayScore(d, today) !== (d.score_remaining ?? d.score)) probs.push(`spot ${f0.spot.id}: today's score`);
    if (d?.remaining_from && todayStale(f0, at).stale !== (Math.floor(at / 36e5) * 36e5 > Date.parse(d.remaining_from))) probs.push(`spot ${f0.spot.id}: stale flag`);
  }
  const rc = regionCalls();
  console.log(`${t}: ${probs.length} problems; ${rc.length} regions; ${fresh} forecasts with the new window fields; ${also} 'also worth a look' windows`);
  if (!times.length || process.env.V) rc.forEach((c) => console.log(`  ${c.region}: ${c.rating} ${c.score} [${c.dayLabel}] ${c.call}`));
  probs.forEach((p) => console.log("  !", p)); bad += probs.length;
}
Date.now = real;
process.exit(bad ? 1 : 0);
