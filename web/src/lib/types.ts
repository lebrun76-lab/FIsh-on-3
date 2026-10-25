/**
 * Forecast Brain API contract (v1) — the boundary between the website and the
 * Python forecast engine ("Forecast Brain"). The site only ever talks to these
 * shapes; the prototype serves them from mock data (src/lib/mock.ts) via
 * /api/v1/* route handlers. See docs/forecast-api.md.
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
}

export interface HourPoint {
  time: string;                 // "2026-10-26T06:00:00+13:00"
  wind_kn: number | null;
  gust_kn: number | null;
  wind_dir_deg: number | null;
  swell_m: number | null;       // null for freshwater / beyond marine horizon
  swell_period_s: number | null;
  sst_c: number | null;         // sea-surface temperature; null for freshwater
  tide_m: number | null;        // height relative to mean sea level (not a nav datum)
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
}

export interface DaySummary {
  date: string;                 // "2026-10-26"
  score: number;
  rating: Rating;
  summary: string;              // "Calm morning, breeze picks up after lunch"
  wind_kn_avg: number | null;
  gust_kn_max: number | null;
  swell_m_avg: number | null;
  rain_mm: number | null;
  sst_c_avg: number | null;
  sunrise: string;
  sunset: string;
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
  hourly: HourPoint[];
}
