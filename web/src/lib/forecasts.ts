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

const DIR = process.env.FISHCAST_FORECAST_DIR ?? path.join(process.cwd(), "data", "forecasts");
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
  return { ...m, data_status: "mock-fallback", fallback_reason: reason, sources: ["MOCK FALLBACK - not a real forecast", ...m.sources] };
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
    const t = trim({ ...f, data_status: "engine", stale: ageH > STALE_H });
    // Use the engine's verdict (next 3 days). Only re-derive it once its window has passed,
    // and then only from windows still inside a 3-day horizon from now.
    const vEnd = f.verdict.window?.end ? Date.parse(f.verdict.window.end) : null;
    if (vEnd !== null && vEnd <= Date.now()) {
      const horizon = Date.now() + (f.verdict.horizon_days ?? 3) * 864e5;
      const bw = t.windows.filter((w) => Date.parse(w.start) < horizon).sort((a, b) => b.score - a.score)[0];
      if (bw) t.verdict = { ...t.verdict, rating: bw.rating, score: bw.score, headline: (bw.rating === "great" || bw.rating === "good" ? "Go " : "Best chance: ") + bw.advice.split(",")[0], advice: bw.advice, confidence: bw.confidence ?? t.verdict.confidence, window: { start: bw.start, end: bw.end } };
    }
    return t;
  } catch (e) {
    return mockFallback(id, `Engine output unreadable: ${(e as Error).message}`);
  }
}

export const allForecasts = () => SPOTS.map((s) => getForecast(s.id)!).filter(Boolean);

/** First day that still has fishable daylight (engine returns score=null late at night). */
export const nextDayIndex = (f: SpotForecast) => Math.max(0, f.days.findIndex((d) => d.score !== null));

export { speciesOf } from "./view";
