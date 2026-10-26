import { allForecasts } from "./forecasts";
import { speciesOf } from "./view";
import type { Rating } from "./types";
import { speciesFor, sizeText } from "./rules";
import { dateLabel, nzTodayISO } from "./time";
import { bestCall, targetList } from "./call";

export interface SpotSummary { id: string; name: string; region: string; island: string; lat: number; lon: number; coastal: boolean; species: string[]; rating: Rating; score: number; headline: string; mock?: boolean; }
export async function allSummaries(): Promise<SpotSummary[]> {
  return (await allForecasts()).map((f) => {
    const s = f.spot;
    return { id: s.id, name: s.name, region: s.region, island: s.island, lat: s.lat, lon: s.lon, coastal: s.coastal, species: s.species, rating: f.verdict.rating, score: f.verdict.score, headline: f.verdict.headline, mock: f.data_status === "mock-fallback" };
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
    const name = s.name.split(" (")[0];
    const fishable = c.kind === "window";
    const call = fishable
      ? `${c.headline} at ${name}. ${targetList(targets)}${sp[0] ? `. ${sp[0].name}: ${sizeText(sp[0])}` : ""}.`
      : `Give ${name} a miss for the next ${c.dates.length} days. Nothing scores well enough.`;
    const row: RegionCall = { region: s.region, spotId: s.id, spotName: name, rating: c.rating, score: c.score, call, tactics: (c.window ? speciesOf(f).find((x) => x.status !== "closed")?.how : undefined) ?? sp[0]?.tactics ?? "", species: targets, dayLabel: fishable ? (c.date === todayISO ? "Today" : dateLabel(c.date)) : "Next 3 days", mock: f.data_status === "mock-fallback", fishable };
    const prev = best.get(s.region);
    if (!prev || Number(row.fishable) - Number(prev.fishable) > 0 || (row.fishable === prev.fishable && row.score > prev.score)) best.set(s.region, row);
  }
  return [...best.values()].sort((a, b) => Number(b.fishable) - Number(a.fishable) || b.score - a.score);
}
