import { allForecasts } from "./forecasts";
import { speciesOf } from "./view";
import type { Rating } from "./types";
import { speciesFor } from "./rules";
import { headlineRule } from "./catch";
import { dateLabel, nzTodayISO } from "./time";
import { bestCall, dayScore, targetList } from "./call";
import { clock } from "./time";
import type { SpotForecast } from "./types";

export interface SpotSummary {
  id: string; name: string; region: string; island: string; lat: number; lon: number; coastal: boolean; species: string[]; rating: Rating; score: number; headline: string; best: string | null; mock?: boolean;
  /** Where the forecast is taken: the engine's at-sea weather point (spot.forecast_point), else the display centre. */
  pt: [number, number];
  /** Map day picker: score per "YYYY-MM-DD" (the day), "YYYY-MM-DDam" and "YYYY-MM-DDpm" (best few daylight hours). */
  slots: Record<string, number>;
  /** Today only (the free plan's call). */
  day: { rating: Rating; score: number; headline: string };
  /** Key numbers for the pick (or today): "12 kn SW", "0.8 m", "High 3:12pm". */
  nums: { wind: string | null; sea: string | null; tide: string | null };
}

/** Mean of the best 3 daylight hours still to come in each half of each day. */
function halfScores(f: SpotForecast, now: number): Record<string, number> {
  const by = new Map<string, number[]>();
  for (const h of f.hourly) {
    if (h.score == null || h.light === "dark" || Date.parse(h.time) + 36e5 <= now) continue;
    const k = h.time.slice(0, 10) + (Number(h.time.slice(11, 13)) < 12 ? "am" : "pm");
    (by.get(k) ?? by.set(k, []).get(k)!).push(h.score);
  }
  const out: Record<string, number> = {};
  for (const [k, v] of by) { const top = v.sort((a, b) => b - a).slice(0, 3); out[k] = Math.round((top.reduce((a, b) => a + b, 0) / top.length) * 10) / 10; }
  return out;
}

function numsOf(f: SpotForecast, now: number): SpotSummary["nums"] {
  const w = bestCall(f, "horizon", now).window, d = f.days.find((x) => x.score !== null) ?? f.days[0];
  const kn = w?.wind_kn ?? d?.wind_kn_avg, sea = w ? w.wave_m ?? w.swell_m : d?.wave_m_avg ?? d?.swell_m_avg;
  const t = f.spot.coastal ? f.tides.find((x) => Date.parse(x.time) > now) : undefined;
  return {
    wind: kn == null ? null : `${Math.round(kn)} kn${w?.wind_from ? ` ${w.wind_from}` : ""}`,
    sea: !f.spot.coastal || sea == null ? null : `${Math.round(sea * 10) / 10} m`,
    tide: t ? `${t.type === "high" ? "High" : "Low"} ${clock(t.time)}` : null,
  };
}
export async function allSummaries(): Promise<SpotSummary[]> {
  const now = Date.now(), today = nzTodayISO();
  return (await allForecasts()).map((f) => {
    const s = f.spot;
    const c = bestCall(f, "horizon", now), dc = bestCall(f, "day", now);
    const fp = s.coastal && s.forecast_point ? s.forecast_point : null;
    const slots = halfScores(f, now);
    for (const d of f.days) { const v = dayScore(d, today); if (v != null) slots[d.date] = v; }
    return { id: s.id, name: s.name, region: s.region, island: s.island, lat: s.lat, lon: s.lon, coastal: s.coastal, species: s.species, rating: f.verdict.rating, score: f.verdict.score, headline: f.verdict.headline, best: c.kind === "window" ? c.headline : null, mock: f.data_status === "mock-fallback",
      pt: fp ? [fp.lat, fp.lon] : [s.lat, s.lon], slots, day: { rating: dc.rating, score: dc.score, headline: dc.headline }, nums: numsOf(f, now) };
  });
}

/** One call per region: the best spot by the same 3-day call its spot page shows.
 *  Badge score, rating and the sentence all come from that one window (lib/call.ts). */
export interface RegionCall { region: string; spotId: string; spotName: string; rating: Rating; score: number; call: string; tactics: string; species: string[]; dayLabel: string; mock?: boolean; fishable: boolean; }
export async function regionCalls(): Promise<RegionCall[]> {
  const best = new Map<string, RegionCall>();
  const todayISO = nzTodayISO();
  for (const f of await allForecasts()) {
    const s = f.spot;
    const c = bestCall(f, "horizon");
    const open = speciesOf(f).filter((x) => x.status !== "closed").map((x) => x.name);
    const targets = (open.length ? open : s.species).slice(0, 2);
    const sp = speciesFor(targets);
    const rule = targets[0] ? headlineRule(s.id, targets[0]) : null;
    const name = s.name.split(" (")[0];
    const fishable = c.kind === "window";
    const call = fishable
      ? `${c.headline} at ${name}. ${targetList(targets)}${rule ? `. ${rule}` : ""}.`
      : `Give ${name} a miss for the next ${c.dates.length} days. Nothing scores well enough.`;
    const row: RegionCall = { region: s.region, spotId: s.id, spotName: name, rating: c.rating, score: c.score, call, tactics: (c.window ? speciesOf(f).find((x) => x.status !== "closed")?.how : undefined) ?? sp[0]?.tactics ?? "", species: targets, dayLabel: fishable ? (c.date === todayISO ? "Today" : dateLabel(c.date)) : "Next 3 days", mock: f.data_status === "mock-fallback", fishable };
    const prev = best.get(s.region);
    if (!prev || Number(row.fishable) - Number(prev.fishable) > 0 || (row.fishable === prev.fishable && row.score > prev.score)) best.set(s.region, row);
  }
  return [...best.values()].sort((a, b) => Number(b.fishable) - Number(a.fishable) || b.score - a.score);
}
