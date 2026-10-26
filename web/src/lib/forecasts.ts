/**
 * Server-side forecast loader. Reads the output of the scheduled job
 * (jobs/run_forecasts.py -> web/data/forecasts/latest/<spot>.json, the same
 * rows that will live in Supabase `spot_forecasts.payload`). If a spot has no
 * engine output (job not run, or the engine failed for it) we fall back to the
 * deterministic mock and label it loudly: data_status = "mock-fallback".
 *
 * Live data: api/refresh_forecasts.py (Python, Vercel) reruns the engine every 3 hours and
 * writes Supabase spot_forecasts. We read latest_spot_forecasts (newest status='ok' row per
 * spot) through the Next data cache, tagged "forecasts" so the refresh can revalidate it, and
 * use whichever of Supabase or the committed file is newer. If Supabase is empty, down or not
 * configured, the committed files keep the page full: a failed refresh never empties a page.
 */
import fs from "node:fs";
import path from "node:path";
import { SPOTS, buildForecast, getSpot } from "./mock";
import type { SpotForecast } from "./types";
import { nzTodayISO } from "./time";
import { bestCall } from "./call";
import { plainDeep, portNames } from "./plain";
import { cache } from "react";
import { publicSupabaseAnonKey, publicSupabaseUrl } from "./supabase/config";

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

/** Cache window for the Supabase read. The refresh revalidates the tag right after each run,
 *  so this only bounds how long a missed revalidation could leave a page behind. */
const DB_REVALIDATE_S = 3 * 3600;

/** Latest stored payload for one spot from Supabase, or null (not configured, empty, error). */
async function dbPayload(id: string): Promise<SpotForecast | null> {
  const url = publicSupabaseUrl(), key = publicSupabaseAnonKey();
  if (!url || !key) return null;
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/latest_spot_forecasts?spot_id=eq.${encodeURIComponent(id)}&select=payload&limit=1`, {
      headers: { apikey: key }, next: { revalidate: DB_REVALIDATE_S, tags: ["forecasts", `forecast:${id}`] }, signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const rows = (await r.json()) as { payload: SpotForecast | null }[];
    return rows[0]?.payload ?? null;
  } catch { return null; }
}

function filePayload(id: string): SpotForecast | null {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, "latest", `${id}.json`), "utf8")) as SpotForecast; } catch { return null; }
}

const usable = (f: SpotForecast | null): f is SpotForecast => !!f && f.api_version === "1" && Array.isArray(f.days) && f.days.length > 0 && !Number.isNaN(Date.parse(f.generated_at));

export const getForecast = cache(async (id: string): Promise<SpotForecast | null> => {
  if (!getSpot(id)) return null;
  const db = await dbPayload(id), file = filePayload(id);
  const candidates = [db, file].filter(usable).sort((a, b) => Date.parse(b.generated_at) - Date.parse(a.generated_at));
  const f = candidates[0];
  if (!f) return mockFallback(id, db || file ? "Engine output unreadable: bad payload" : "No engine output for this spot yet (run jobs/run_forecasts.py).");
  try {
    const ageH = (Date.now() - Date.parse(f.generated_at)) / 3.6e6;
    const t = plainDeep(portNames(trim({ ...f, data_status: "engine", stale: ageH > STALE_H })));
    return withCurrentVerdict(t);
  } catch (e) {
    return mockFallback(id, `Engine output unreadable: ${(e as Error).message}`);
  }
});

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

export const allForecasts = async (): Promise<SpotForecast[]> =>
  (await Promise.all(SPOTS.map((s) => getForecast(s.id)))).filter((f): f is SpotForecast => !!f);

/** First day that still has fishable daylight (engine returns score=null late at night). */
export { nextDayIndex } from "./call";

export { speciesOf } from "./view";
