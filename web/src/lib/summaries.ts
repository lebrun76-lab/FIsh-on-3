import { SPOTS, buildForecast } from "./mock";
import type { Rating } from "./types";
export interface SpotSummary { id: string; name: string; region: string; island: string; lat: number; lon: number; coastal: boolean; species: string[]; rating: Rating; score: number; headline: string; }
export function allSummaries(): SpotSummary[] {
  return SPOTS.map((s) => {
    const f = buildForecast(s, 10);
    return { id: s.id, name: s.name, region: s.region, island: s.island, lat: s.lat, lon: s.lon, coastal: s.coastal, species: s.species, rating: f.verdict.rating, score: f.verdict.score, headline: f.verdict.headline };
  });
}

import { SPOTS as ALL, buildForecast as bf } from "./mock";
import { speciesFor, sizeText } from "./rules";
import { clock } from "./time";
import { rate } from "./mock";
/** One plain-English call per region for TODAY: "Go, 6–9am, Bay of Islands — snapper/kahawai, snapper legal size 30 cm". */
export interface RegionCall { region: string; spotId: string; spotName: string; rating: Rating; score: number; call: string; tactics: string; species: string[]; }
export function regionCalls(): RegionCall[] {
  const today = new Map<string, RegionCall>();
  for (const s of ALL) {
    const f = bf(s, 10);
    const w = f.windows.filter((x) => x.start.slice(0, 10) === f.days[0].date).sort((a, b) => b.score - a.score)[0];
    const score = w?.score ?? f.days[0].score;
    const sp = speciesFor(s.species);
    const name = s.name.split(" (")[0];
    const call = w
      ? `Go, ${clock(w.start)}–${clock(w.end)}, ${name} — ${s.species.slice(0, 2).join("/").toLowerCase()}${sp[0] ? `, ${sp[0].name.toLowerCase()} ${sizeText(sp[0])}` : ""}.`
      : score >= 4.5 ? `Maybe — ${name} is fishable but no standout window today.` : `Give it a miss today at ${name}. ${f.days[0].summary}.`;
    const prev = today.get(s.region);
    if (!prev || score > prev.score) today.set(s.region, { region: s.region, spotId: s.id, spotName: name, rating: rate(score), score, call, tactics: sp[0]?.tactics ?? "", species: s.species.slice(0, 3) });
  }
  return [...today.values()].sort((a, b) => b.score - a.score);
}
