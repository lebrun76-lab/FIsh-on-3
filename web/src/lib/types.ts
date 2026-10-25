/**
 * Forecast Brain API contract (v1) — the boundary between the website and the
 * Python forecast engine ("Forecast Brain"). The site only ever talks to these
 * shapes. Data now comes from the real engine (fishon_engine) via the local
 * scheduled job jobs/run_forecasts.py -> web/data/forecasts/latest/*.json
 * (read by src/lib/forecasts.ts); src/lib/mock.ts is only a labelled fallback.
 * Fields marked "v1.1 proposed" are additive extras the engine provides that
 * v1 had no slot for. See docs/forecast-api.md.
 * All times are ISO 8601 with offset, in Pacific/Auckland. Units are fixed:
 * knots, metres, seconds, °C, mm.
 */

export type Rating = "great" | "good" | "marginal" | "poor";

export interface Spot {
  id: string;
  name: string;
  region: string;
  island: "North" | "South";
  lat: number;
  lon: number;
  species: string[];
  notes: string;
  tags: string[];
  coastal: boolean;
  facing_deg?: number | null;   // v1.1 proposed: bearing the shore faces
  facing_note?: string;
  tide_port?: string | null;    // v1.1 proposed: LINZ standard port used
  tide_note?: string;
}

export interface HourPoint {
  time: string;                 // "2026-10-26T06:00:00+13:00"
  wind_kn: number | null;
  gust_kn: number | null;
  wind_dir_deg: number | null;
  swell_m: number | null;       // engine: total sea state (sea_m = wave height), not swell only
  swell_period_s: number | null;
  sst_c: number | null;         // sea-surface temperature; null for freshwater
  tide_m: number | null;        // engine: LINZ chart datum (or MSL when modelled) - see SpotForecast.tide_datum
  rain_mm: number | null;
  score: number | null;         // 0–10 fishability for that hour
}

export interface TideEvent {
  time: string;
  type: "high" | "low";
  height_m: number;
}

export interface FishingWindow {
  start: string;
  end: string;
  score: number;
  rating: Rating;
  headline: string;             // "Saturday 6–10am looks great"
  advice: string;               // plain-English, 1–2 sentences
  reasons: string[];            // short bullet reasons: "Light wind 5–8 kn"
  confidence?: "high" | "medium" | "low"; // v1.1 proposed
}

export interface SpeciesStatus {  // v1.1 proposed (engine species.py, sourced)
  name: string;
  status: "closed" | "peak" | "in season" | "off-peak" | "no seasonal data";
  how: string;
  notes: string[];
  sources: string[];
}

export interface DaySummary {
  date: string;                 // "2026-10-26"
  score: number | null;         // engine: null when no daylight is left (late tonight)
  rating: Rating;
  summary: string;              // "Calm morning, breeze picks up after lunch"
  wind_kn_avg: number | null;
  gust_kn_max: number | null;
  swell_m_avg: number | null;
  rain_mm: number | null;
  sst_c_avg: number | null;
  sunrise: string;
  sunset: string;
  // v1.1 proposed additive fields from the engine
  label?: string;
  confidence?: "high" | "medium" | "low";
  verdict_text?: string;
  best_window_text?: string | null;
  moon?: { phase: string; age_days: number; illumination_pct: number; near_new_or_full: boolean };
  species?: SpeciesStatus[];
}

export interface Verdict {
  rating: Rating;
  score: number;                // best score over the period
  headline: string;             // "Go Saturday morning"
  advice: string;               // the plain-English paragraph shown first
  confidence: "high" | "medium" | "low";
}

export interface SpotForecast {
  api_version: "1";
  spot: Spot;
  generated_at: string;
  model_run: string;            // upstream model run used
  sources: string[];            // attribution, e.g. "Open-Meteo (CC BY 4.0)"
  verdict: Verdict;
  days: DaySummary[];
  windows: FishingWindow[];
  tides: TideEvent[];
  hourly: HourPoint[];           // engine output is 3-hourly (see hourly_step_h)
  // v1.1 proposed additive fields
  data_status?: "engine" | "mock-fallback";
  fallback_reason?: string;
  stale?: boolean;
  run_id?: string;
  engine_version?: string;
  hourly_step_h?: number;
  tide_source?: string | null;
  tide_datum?: string | null;
  tide_series?: { time: string; height_m: number }[];
  warnings?: string[];
}
