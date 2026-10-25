import { allForecasts, nextDayIndex } from "./forecasts";
import { speciesOf } from "./view";
import type { Rating } from "./types";
import { speciesFor, sizeText } from "./rules";
import { clock, dateLabel, nzTodayISO } from "./time";

export interface SpotSummary { id: string; name: string; region: string; island: string; lat: number; lon: number; coastal: boolean; species: string[]; rating: Rating; score: number; headline: string; mock?: boolean; }
export function allSummaries(): SpotSummary[] {
  return allForecasts().map((f) => {
    const s = f.spot;
    return { id: s.id, name: s.name, region: s.region, island: s.island, lat: s.lat, lon: s.lon, coastal: s.coastal, species: s.species, rating: f.verdict.rating, score: f.verdict.score, headline: f.verdict.headline, mock: f.data_status === "mock-fallback" };
  });
}

/** One plain-English call per region for the next fishing day ("today", or tomorrow once today's light has gone). */
export interface RegionCall { region: string; spotId: string; spotName: string; rating: Rating; score: number; call: string; tactics: string; species: string[]; dayLabel: string; mock?: boolean; }
export function regionCalls(): RegionCall[] {
  const best = new Map<string, RegionCall>();
  const todayISO = nzTodayISO();
  for (const f of allForecasts()) {
    const s = f.spot;
    const day = f.days[nextDayIndex(f)];
    const w = f.windows.filter((x) => x.start.slice(0, 10) === day.date).sort((a, b) => b.score - a.score)[0];
    const score = w?.score ?? day.score ?? 0;
    const open = speciesOf(f).filter((x) => x.status !== "closed").map((x) => x.name);
    const targets = (open.length ? open : s.species).slice(0, 2);
    const sp = speciesFor(targets);
    const name = s.name.split(" (")[0];
    const when = day.date === todayISO ? "today" : dateLabel(day.date);
    const call = w && w.score >= 4.5
      ? `${w.rating === "marginal" ? "Best chance" : "Go"}, ${clock(w.start)}–${clock(w.end)}, ${name} — ${targets.join("/").toLowerCase()}${sp[0] ? `, ${sp[0].name.toLowerCase()} ${sizeText(sp[0])}` : ""}.`
      : score >= 4.5 ? `Maybe — ${name} is fishable but no standout window ${when}.` : `Give it a miss ${when} at ${name}: no fishable window. ${day.summary}.`;
    const prev = best.get(s.region);
    if (!prev || score > prev.score) best.set(s.region, { region: s.region, spotId: s.id, spotName: name, rating: w?.rating ?? day.rating, score, call, tactics: speciesOf(f).find((x) => x.status !== "closed")?.how ?? sp[0]?.tactics ?? "", species: targets, dayLabel: day.date === todayISO ? "Today" : dateLabel(day.date), mock: f.data_status === "mock-fallback" });
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
