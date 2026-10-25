// Consistency check: every badge must match the call it sits next to.
// Run: npx tsx scripts/check-calls.ts [ISO time ...]
// Each forecast is checked as loaded AND with the feat/windows-and-copy fields stripped
// (near_best, score_remaining, remaining_from, score_full_day, and 2.3's valid_until /
// tide_port_linz_name), so older output keeps working.
import { allSummaries, regionCalls } from "../src/lib/summaries";
import { allForecasts } from "../src/lib/forecasts";
import { bestCall, dayScore, isNearBest, listsAllWindows, ratingFor, todayStale } from "../src/lib/call";
import { nzTodayISO } from "../src/lib/time";
import { plain, plainDeep, portNames, tideSourceText } from "../src/lib/plain";
import type { FishingWindow, SpotForecast } from "../src/lib/types";

const DASH = /—| [-–] /;                       // no em dashes, no spaced dashes
const HYPE = /\b(unlock|elevate|revolutioni[sz]e|AI[- ]powered|game[- ]chang|supercharge|seamless)/i;
const copyProbs = (where: string, s: string) => [DASH.test(s) ? `${where}: dash "${s}"` : "", HYPE.test(s) ? `${where}: hype "${s}"` : ""].filter(Boolean);

const HYPHEN_RANGE = /\b\d{1,2}(:\d\d)?(am|pm)?-\d{1,2}(:\d\d)?(am|pm)\b/; // "8-11am": 2.3 uses an en dash
const rangeProbs = (where: string, s: string) => (HYPHEN_RANGE.test(s) ? [`${where}: hyphen time range "${s}"`] : []);

const stripW = (w: FishingWindow | null | undefined) => { if (!w) return w; const { near_best: _n, ...rest } = w; return rest as FishingWindow; };
const legacy = (f: SpotForecast): SpotForecast => ({
  ...f, valid_until: undefined, spot: { ...f.spot, tide_port_linz_name: undefined },
  windows: f.windows.map((w) => stripW(w)!),
  days: f.days.map(({ score_remaining: _a, remaining_from: _b, score_full_day: _c, ...d }) => ({ ...d, best_window: stripW(d.best_window), least_bad_window: stripW(d.least_bad_window) })),
});

// Port names and brackets: plain() must not touch "Area (Place)"; older "Area - Place" output gets the 2.3 form.
const fixed: string[] = [];
for (const [s, want] of [["Lottin Point (Wakatiri)", "Lottin Point (Wakatiri)"], ["LINZ secondary port Coromandel Harbour (Whanganui Island) (offsets from Auckland)", "LINZ secondary port Coromandel Harbour (Whanganui Island) (offsets from Auckland)"], ["Mon 8–11am looks great", "Mon 8–11am looks great"], ["Mon 10am–1pm is fishable", "Mon 10am–1pm is fishable"], ["Best: Mon 10am-1pm.", "Best: Mon 10am–1pm."], ["Mon 8-11am, HW -21 min, 2026-10-26", "Mon 8–11am, HW -21 min, 2026-10-26"]] as const)
  if (plain(s) !== want) fixed.push(`plain("${s}") gave "${plain(s)}"`);
{
  const old = { spot: { tide_port: "Lottin Point - Wakatiri" }, tide_source: "LINZ Lottin Point - Wakatiri", sources: ["Tides: LINZ Lottin Point - Wakatiri"] };
  const n = plainDeep(portNames(old));
  if (n.spot.tide_port !== "Lottin Point (Wakatiri)" || n.tide_source !== "LINZ Lottin Point (Wakatiri)" || n.sources[0] !== "Tides: LINZ Lottin Point (Wakatiri)" || (n.spot as { tide_port_linz_name?: string }).tide_port_linz_name !== "Lottin Point - Wakatiri") fixed.push(`portNames on older output: ${JSON.stringify(n)}`);
  const n2 = portNames({ spot: { tide_port: "Lottin Point (Wakatiri)", tide_port_linz_name: "Lottin Point - Wakatiri" } });
  if (n2.spot.tide_port !== "Lottin Point (Wakatiri)") fixed.push("portNames changed 2.3 output");
  const t = tideSourceText("LINZ secondary port Coromandel Harbour (Whanganui Island) (offsets from Auckland)", 5.8);
  if (t !== "LINZ secondary port Coromandel Harbour (Whanganui Island), offsets from Auckland, 5.8 km away") fixed.push(`tideSourceText gave "${t}"`);
}

const real = Date.now;
const times = process.argv.slice(2);
let bad = 0;
for (const t of times.length ? times : [new Date().toISOString()]) {
  const at = Date.parse(t); Date.now = () => at;
  const probs: string[] = [...fixed];
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
  let fresh = 0, also = 0, until = 0;
  const versions = new Map<string, number>();
  const today = nzTodayISO();
  for (const f0 of allForecasts()) {
    if (listsAllWindows(f0)) fresh++;
    if (f0.data_status === "engine") versions.set(f0.engine_version ?? "none", (versions.get(f0.engine_version ?? "none") ?? 0) + 1);
    probs.push(...f0.windows.flatMap((w) => rangeProbs(`window ${f0.spot.id} ${w.start}`, `${w.headline} ${w.advice}`)), ...f0.days.flatMap((d) => rangeProbs(`day ${f0.spot.id} ${d.date}`, d.summary)), ...rangeProbs(`verdict ${f0.spot.id}`, `${f0.verdict.headline} ${f0.verdict.advice}`));
    // port names: shown form has no spaced hyphen; raw LINZ name only in tide_port_linz_name
    for (const [k, v] of [["tide_port", f0.spot.tide_port], ["tide_source", f0.tide_source], ["tide_note", f0.spot.tide_note], ...f0.sources.map((x) => ["sources", x] as const)] as const) if (v && / - /.test(v)) probs.push(`spot ${f0.spot.id}: ${k} still has a spaced hyphen "${v}"`);
    if (f0.spot.coastal && f0.tide_source && /\)\s*\(/.test(tideSourceText(f0.tide_source, f0.spot.tide_port_km))) probs.push(`spot ${f0.spot.id}: stacked brackets in tides text`);
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
    // stale: valid_until when present, else the remaining_from hour (both ways on every forecast)
    if (f0.valid_until) {
      until++;
      if (todayStale(f0, at).stale !== (at >= Date.parse(f0.valid_until))) probs.push(`spot ${f0.spot.id}: stale flag (valid_until)`);
      if (d?.remaining_from && Date.parse(f0.valid_until) !== Date.parse(d.remaining_from) + 36e5) probs.push(`spot ${f0.spot.id}: valid_until is not remaining_from + 1 h`);
    }
    // fallback: same output without valid_until must use remaining_from, and (for 2.3) agree with valid_until
    const nv = { ...f0, valid_until: undefined };
    if (d?.remaining_from && todayStale(nv, at).stale !== (Math.floor(at / 36e5) * 36e5 > Date.parse(d.remaining_from))) probs.push(`spot ${f0.spot.id}: stale flag (remaining_from)`);
    if (d?.remaining_from && f0.valid_until && todayStale(nv, at).stale !== todayStale(f0, at).stale) probs.push(`spot ${f0.spot.id}: valid_until and remaining_from disagree`);
    if (d?.remaining_from && f0.valid_until && Date.parse(todayStale(nv, at).until!) !== Date.parse(f0.valid_until)) probs.push(`spot ${f0.spot.id}: fallback 'due at' time differs from valid_until`);
  }
  const rc = regionCalls();
  console.log(`${t}: ${probs.length} problems; ${rc.length} regions; ${fresh} forecasts with the new window fields; ${until} with valid_until; ${also} 'also worth a look' windows; engine versions ${[...versions].map(([v, n]) => `${v}×${n}`).join(", ")}`);
  if (!times.length || process.env.V) rc.forEach((c) => console.log(`  ${c.region}: ${c.rating} ${c.score} [${c.dayLabel}] ${c.call}`));
  probs.forEach((p) => console.log("  !", p)); bad += probs.length;
}
Date.now = real;
process.exit(bad ? 1 : 0);
