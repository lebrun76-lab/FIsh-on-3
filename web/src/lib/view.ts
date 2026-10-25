/** Client-safe helpers for engine v1 payloads (no fs imports here). */
import type { SpotForecast, TideDatum } from "./types";

/** Species for a forecast: engine 2.1 sends them once at top level; 2.0 sent them per day. */
export const speciesOf = (f: SpotForecast) => f.species ?? f.days[0]?.species ?? [];

export const DATUM_TEXT: Record<TideDatum, string> = {
  chart_datum: "metres above LINZ chart datum (roughly the lowest tide)",
  msl: "metres above/below mean sea level (modelled, not an official LINZ prediction)",
};

export const latLon = (lat: number, lon: number) => `${Math.abs(lat).toFixed(2)}°${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(2)}°${lon < 0 ? "W" : "E"}`;

const DIRS: Record<string, string> = { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" };
export const dirWord = (c: string) => DIRS[c] ?? c;
