/**
 * Server-side forecast loader. Reads the output of the scheduled job
 * (jobs/run_forecasts.py -> web/data/forecasts/latest/<spot>.json, the same
 * rows that will live in Supabase `spot_forecasts.payload`). If a spot has no
 * engine output (job not run, or the engine failed for it) we fall back to the
 * deterministic mock and label it loudly: data_status = "mock-fallback".
 * Production: replace readFileSync with a Supabase select on latest_spot_forecasts.
 */
import fs from "node:fs";
import path from "node:path";
import { SPOTS, buildForecast, getSpot } from "./mock";
import type { SpotForecast } from "./types";
import { nzTodayISO } from "./time";
import { bestCall } from "./call";
import { plainDeep, portNames } from "./plain";

const DIR = process.env.SALTSUPPLY_FORECAST_DIR ?? process.env.FISHCAST_FORECAST_DIR /* deprecated */ ?? path.join(process.cwd(), "data", "forecasts");
const STALE_H = 6;

export interface RunManifest { run_id: string; finished_at: string; status: string; engine_version: string; spots_ok: string[]; spots_failed: Record<string, string>; open_meteo_tier: string; contract_problems?: Record<string, string[]>; model_run?: string; sst_map?: { valid_time_nz: string; api_calls_counted: number } | null }

export function runManifest(): RunManifest | null {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8")); } catch { return null; }
}

function trim(f: SpotForecast): SpotForecast {
  const today = nzTodayISO();
  const now = Date.now();
  const days = f.days.filter((d) => d.date >= today);
  if (!days.length) return f; // whole file is in the past: keep it, it is flagged stale
  return {
    ...f,
    days,
    windows: f.windows.filter((w) => Date.parse(w.end) > now),
    tides: f.tides.filter((t) => t.time.slice(0, 10) >= today),
    hourly: f.hourly.filter((h) => h.time.slice(0, 10) >= today),
    tide_series: f.tide_series?.filter((t) => t.time.slice(0, 10) >= today),
  };
}

function mockFallback(id: string, reason: string): SpotForecast | null {
  const spot = getSpot(id);
  if (!spot) return null;
  const m = buildForecast(spot, 10);
  return withCurrentVerdict(plainDeep({ ...m, data_status: "mock-fallback" as const, fallback_reason: reason, sources: ["MOCK FALLBACK: not a real forecast", ...m.sources] }));
}

export function getForecast(id: string): SpotForecast | null {
  if (!getSpot(id)) return null;
  let raw: string;
  try { raw = fs.readFileSync(path.join(DIR, "latest", `${id}.json`), "utf8"); }
  catch { return mockFallback(id, "No engine output for this spot yet (run jobs/run_forecasts.py)."); }
  try {
    const f = JSON.parse(raw) as SpotForecast;
    if (f.api_version !== "1" || !Array.isArray(f.days) || !f.days.length) throw new Error("bad payload");
    const ageH = (Date.now() - Date.parse(f.generated_at)) / 3.6e6;
    const t = plainDeep(portNames(trim({ ...f, data_status: "engine", stale: ageH > STALE_H })));
    return withCurrentVerdict(t);
  } catch (e) {
    return mockFallback(id, `Engine output unreadable: ${(e as Error).message}`);
  }
}

/** Keep verdict.rating/score/window/headline on the same window as bestCall("horizon"),
 *  e.g. once the engine's pick has passed. Advice text follows the window. */
function withCurrentVerdict(f: SpotForecast): SpotForecast {
  const c = bestCall(f, "horizon");
  const v = f.verdict;
  if (c.kind === "window" && c.window && c.window.start === v.window?.start) return { ...f, verdict: { ...v, headline: c.headline } }; // engine's pick still stands
  if (c.kind === "window") {
    const w = c.window;
    return { ...f, verdict: { ...v, rating: c.rating, score: c.score, headline: c.headline, advice: w?.advice ?? `${c.when[0].toUpperCase() + c.when.slice(1)}, worked out from the hourly scores after the engine's own windows passed.`, confidence: w?.confidence ?? v.confidence, window: { start: c.start!, end: c.end! }, no_window_reason: null, least_bad: null } };
  }
  const hadWindow = !!v.window;
  return { ...f, verdict: { ...v, rating: "poor", score: hadWindow ? c.score : v.score, headline: c.headline, window: null,
    no_window_reason: hadWindow ? `No fishable window left in the next ${v.horizon_days ?? 3} days: the good windows have passed.` : v.no_window_reason,
    advice: hadWindow ? "The good windows in the next few days have passed." : v.advice } };
}

export const allForecasts = () => SPOTS.map((s) => getForecast(s.id)!).filter(Boolean);

/** First day that still has fishable daylight (engine returns score=null late at night). */
export { nextDayIndex } from "./call";

export { speciesOf } from "./view";
