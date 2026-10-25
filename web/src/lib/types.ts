/**
 * Forecast Brain API contract (v1) — the boundary between the website and the
 * Python forecast engine ("Forecast Brain"). The site only ever talks to these
 * shapes. Data now comes from the real engine (fishon_engine) via the local
 * scheduled job jobs/run_forecasts.py -> web/data/forecasts/latest/*.json
 * (read by src/lib/forecasts.ts); src/lib/mock.ts is only a labelled fallback.
 * Since fishon_engine 2.1 (PR #5) the engine emits this contract itself
 * (fishon_engine.contract.validate_v1); the job passes it through. Fields
 * marked "v1.1" are additive extras beyond the original v1 draft. See
 * docs/forecast-api.md.
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
  tide_port?: string | null;    // v1.1: LINZ port used (standard or nearest secondary)
  tide_port_id?: string | null;
  tide_port_km?: number | null; // distance spot -> tide port
  tide_note?: string;
  forecast_point?: ModelPoint & { cell_selection?: "sea" | "land" | string; note?: string | null }; // v1.1: where the weather is taken
  marine_point?: ModelPoint | null;                                                                // v1.1: where waves/SST are taken
}

export interface ModelPoint { lat: number; lon: number; model_cell?: { lat: number; lon: number; elevation_m: number | null } }

export interface HourPoint {
  time: string;                 // "2026-10-26T06:00:00+13:00"
  wind_kn: number | null;
  gust_kn: number | null;
  wind_dir_deg: number | null;
  swell_m: number | null;       // swell only (engine 2.1); see wave_m for total sea
  swell_period_s: number | null;
  sst_c: number | null;         // sea-surface temperature; null for freshwater
  tide_m: number | null;        // see TideEvent.datum / SpotForecast.tide_datum
  rain_mm: number | null;
  score: number | null;         // 0–10 fishability for that hour
  // v1.1 (engine 2.1)
  wave_m?: number | null;       // total significant wave height (wind sea + swell) - what scoring and safety use
  wind_rel?: "offshore" | "cross-offshore" | "cross-shore" | "cross-onshore" | "onshore" | string | null;
  light?: "dawn" | "day" | "dusk" | "dark" | string;
  tide_phase?: "rising" | "falling" | string | null;
  rating?: Rating;
}

export type TideDatum = "chart_datum" | "msl";

export interface TideEvent {
  time: string;
  type: "high" | "low";
  height_m: number;
  datum?: TideDatum;            // v1.1: per event
  source?: string;              // "LINZ" | "harmonic model"
}

export interface FishingWindow {
  start: string;
  end: string;
  score: number;
  rating: Rating;
  headline: string;             // "Saturday 6–10am looks great"
  advice: string;               // plain-English, 1–2 sentences
  reasons: string[];            // short bullet reasons: "Light wind 5–8 kn"
  confidence?: "high" | "medium" | "low"; // v1.1: engine 2.2 = lead time lowered by model disagreement / data gaps
  confidence_detail?: ConfidenceDetail;    // v1.1 (engine 2.2)
  label?: string;                          // engine 2.2: "least-bad (not recommended)" on least-bad windows
  // v1.1 (engine 2.1): up to 3 windows per day, in time order
  date?: string;
  wind_kn?: number | null;
  gust_max_kn?: number | null;
  wind_from?: string | null;
  wind_rel?: string | null;
  wave_m?: number | null;
  swell_m?: number | null;
  swell_period_s?: number | null;
  rain_mm?: number | null;
}

/** Engine 2.2 (docs/CONFIDENCE.md): why a window has the confidence it has. */
export interface ConfidenceDetail {
  level: "high" | "medium" | "low";
  lead_days: number;
  lead_level: "high" | "medium" | "low";
  agreement: "good" | "fair" | "poor" | "unknown";
  score_best_match?: number | null;
  model_scores?: Record<string, number>;   // "wind:ecmwf_ifs025", "waves:meteofrance_wave", ...
  score_spread?: number | null;
  models_missing?: string[];
  gap_hours?: number;
  downgrades?: string[];
}

export interface SpeciesStatus {  // v1.1 (engine species.py, sourced) - once per forecast
  name: string;
  status: "closed" | "peak" | "in season" | "off-peak" | "no seasonal data";
  how: string;
  notes: string[];
  sources: string[];
  changes?: { date: string; status: string; text?: string }[]; // status changes inside the forecast range
}

export interface DaySummary {
  date: string;                 // "2026-10-26"
  score: number | null;         // engine: null when no daylight is left (late tonight)
  rating: Rating;
  summary: string;              // "Calm morning, breeze picks up after lunch"
  wind_kn_avg: number | null;
  gust_kn_max: number | null;
  swell_m_avg: number | null;   // swell only (engine 2.1)
  wave_m_avg?: number | null;   // v1.1: total sea
  wind_kn_max?: number | null;  // v1.1
  rain_mm: number | null;
  sst_c_avg: number | null;
  sunrise: string;
  sunset: string;
  // v1.1 proposed additive fields from the engine
  label?: string;
  confidence?: "high" | "medium" | "low";
  verdict_text?: string;
  best_window_text?: string | null;
  best_window?: FishingWindow | null; // v1.1 (engine 2.1)
  windows?: number;                   // v1.1: number of fishable windows that day
  // engine 2.2: best_window is null on a day with no fishable window
  no_window_reason?: string | null;
  least_bad_window?: FishingWindow | null; // labelled "least-bad (not recommended)"
  lead_confidence?: "high" | "medium" | "low";
  gust_kn_max_daylight?: number | null;    // gust_kn_max / wind_kn_max are over all hours (2.2)
  wind_kn_max_daylight?: number | null;
  moon?: { phase: string; age_days: number; illumination_pct: number; near_new_or_full: boolean };
  species?: SpeciesStatus[];     // engine 2.0 only; 2.1 sends SpotForecast.species once
}

export interface Verdict {
  rating: Rating;
  score: number;                // engine 2.2: best fishable score in the next horizon_days (least-bad score, or 0, if none)
  headline: string;             // "Go Saturday morning"
  advice: string;               // the plain-English paragraph shown first
  confidence: "high" | "medium" | "low";
  window?: { start: string; end: string } | null; // v1.1: the window the verdict refers to; null = nothing fishable
  // engine 2.2
  horizon_days?: number;        // 3
  horizon_end?: string;         // last date inside the horizon
  no_window_reason?: string | null;
  least_bad?: (Partial<FishingWindow> & { start: string; end: string; score: number; rating: Rating; label?: string }) | null;
  best_later?: { start: string; end: string; date: string; score: number; rating: Rating; headline: string; advice: string; confidence: "high" | "medium" | "low" } | null;
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
  hourly: HourPoint[];           // hourly since engine 2.1 (hourly_step_h = 1)
  // v1.1 proposed additive fields
  data_status?: "engine" | "mock-fallback";
  fallback_reason?: string;
  stale?: boolean;
  run_id?: string;
  engine_version?: string;
  hourly_step_h?: number;
  tide_source?: string | null;
  tide_datum?: TideDatum | null;
  model_runs?: Record<string, string | null>;  // model -> init time (UTC)
  timezone?: string;
  species?: SpeciesStatus[];
  attribution?: string[];
  mapper_version?: string;
  tide_series?: { time: string; height_m: number }[];
  warnings?: string[];
}
