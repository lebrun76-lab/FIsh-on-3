/** Client-safe helpers for engine v1 payloads (no fs imports here). */
import type { ConfidenceDetail, SpotForecast, TideDatum } from "./types";

/** Species for a forecast: engine 2.1 sends them once at top level; 2.0 sent them per day. */
export const speciesOf = (f: SpotForecast) => f.species ?? f.days[0]?.species ?? [];

export const DATUM_TEXT: Record<TideDatum, string> = {
  chart_datum: "metres above LINZ chart datum (roughly the lowest tide)",
  msl: "metres above/below mean sea level (modelled, not an official LINZ prediction)",
};

export const latLon = (lat: number, lon: number) => `${Math.abs(lat).toFixed(2)}°${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(2)}°${lon < 0 ? "W" : "E"}`;

const DIRS: Record<string, string> = { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" };
export const dirWord = (c: string) => DIRS[c] ?? c;

const LEVEL_WORD = { high: "High", medium: "Medium", low: "Low" } as const;

/** Plain-English confidence, from the engine's model-agreement detail when present. */
export function confidenceText(level: "high" | "medium" | "low", d?: ConfidenceDetail | null): string {
  if (!d) return `${LEVEL_WORD[level]} confidence.`;
  const why: string[] = [];
  const scores = Object.values(d.model_scores ?? {});
  if (d.agreement === "good") why.push("the weather models agree");
  else if (d.agreement === "fair") why.push("the weather models broadly agree");
  else if (d.agreement === "poor") why.push(scores.length ? `the weather models disagree (they score it anywhere from ${Math.min(...scores).toFixed(1)} to ${Math.max(...scores).toFixed(1)} out of 10)` : "the weather models disagree");
  else why.push("there weren't enough models to cross-check");
  if (d.lead_level !== "high") why.push(d.lead_days >= 7 ? `it's ${d.lead_days} days out, so expect changes` : `it's ${d.lead_days} days out`);
  if (d.gap_hours) why.push(`${d.gap_hours} hour${d.gap_hours > 1 ? "s" : ""} of data missing`);
  const joined = why.length > 1 ? `${why.slice(0, -1).join(", ")} and ${why[why.length - 1]}` : why[0];
  return `${LEVEL_WORD[level]} confidence: ${joined}.`;
}

/** Plain-English "why there's no fishable window" from the engine's no_window_reason. */
export function noWindowText(reason?: string | null, when = "in the next 3 days"): { main: string; conditions?: string } {
  const main = `Nothing worth going out for: no stretch of daylight ${when} scores 4.5/10 (marginal) or better.`;
  const m = reason?.match(/Least-bad is .*? at [\d.]+\/10 \((.*)\)\.?$/);
  const conditions = m?.[1]?.split("; ").map((x) => x.charAt(0).toLowerCase() + x.slice(1)).join(", ");
  return { main, conditions: conditions ? `Even at the best time: ${conditions}.` : undefined };
}
