# Forecast Brain API — v1 contract

This is the boundary between the website and **Forecast Brain**, the Python forecast package another team member is building.
The website only depends on these JSON shapes. The prototype serves them from `src/lib/mock.ts`.
The TypeScript source of truth is `src/lib/types.ts`. Forecast Brain should publish the same schema with Pydantic models and generate OpenAPI from them.

## Conventions
- Times are ISO 8601 with offset, in `Pacific/Auckland` (e.g. `2026-10-26T06:00:00+13:00`).
- Units are fixed: wind and gust in **knots**; swell and tide in **metres**; period in **s**; SST in **°C**; rain in **mm**.
- Null means "not applicable or not available" (freshwater spots, or beyond the marine horizon of about 9 days).
- `score` is 0–10 and `rating` is `great` (≥8) | `good` (≥6.5) | `marginal` (≥4.5) | `poor`.
- The plain-English strings (`headline`, `advice`, `summary`, `reasons`) are produced **by Forecast Brain**, so the wording lives in one place.
- Versioning: `api_version: "1"` and the `/v1/` path. Additive fields are non-breaking.
- Errors look like `{ "error": { "code": "spot_not_found", "message": "..." } }`, with a 4xx/5xx status.
- Attribution: `sources[]` must include `Open-Meteo (CC BY 4.0)` when Open-Meteo data is used.

## Endpoints
| Method | Path | Returns |
|---|---|---|
| GET | `/v1/spots?q=&island=North|South` | `{ spots: Spot[] }` |
| GET | `/v1/spots/{id}/forecast?days=1..10` | `SpotForecast` |
| GET | `/v1/spots/{id}/windows?min_score=6.5` | `{ spot_id, windows: FishingWindow[] }` |
| GET | `/v1/summaries` | `{ summaries: SpotSummary[] }` (best score/rating per spot, for lists and maps) |
| GET (proposed) | `/v1/regions/calls?date=` | `RegionCall[]`, one plain-English call per region (computed site-side in the prototype) |
| GET (proposed) | `/v1/spots/{id}/safety?date=` | `{ level: ok|caution|no, text }`, the combined wind+swell check (site-side in the prototype) |

## Deployment options
1. **Precompute (recommended for MVP).** A cron job (GitHub Actions or Fly/Render, every 1–3 h) runs Forecast Brain for every spot and writes `SpotForecast` JSON into Supabase Postgres (a `forecasts` table with `spot_id` and jsonb). The site reads it with ISR at 30 min. This keeps upstream API calls at about spots × runs/day and is cheap.
2. **Live service.** FastAPI wraps Forecast Brain on Fly.io or Render, and the site calls it server-side with caching.

## Types
```ts
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
```

## Sample `GET /v1/spots/hauraki_gulf/forecast` (truncated mock)
```json
{
 "api_version": "1",
 "spot": {
  "id": "hauraki_gulf",
  "name": "Hauraki Gulf",
  "region": "Auckland",
  "island": "North",
  "lat": -36.7,
  "lon": 175,
  "species": [
   "Snapper",
   "Kingfish",
   "Kahawai",
   "Trevally",
   "John Dory",
   "Gurnard"
  ],
  "notes": "Auckland\u2019s playground. Huge variety of spots from shore and boat.",
  "tags": [
   "coastal",
   "boat",
   "shore"
  ],
  "coastal": true
 },
 "generated_at": "2026-10-25T05:00:00+13:00",
 "model_run": "MOCK",
 "sources": [
  "MOCK DATA \u2014 prototype only",
  "Production: Open-Meteo forecast + marine (CC BY 4.0)"
 ],
 "verdict": {
  "rating": "great",
  "score": 10,
  "headline": "Go Sunday morning",
  "advice": "Sunday 7am\u201311am looks great. wind 7\u20137 kn, small swell ~0.2 m. Get there for 7am. Fish the turn of the low around 7:23am \u2014 that's usually when they come on the bite.",
  "confidence": "medium"
 },
 "days": [
  {
   "date": "2026-10-25",
   "score": 8.5,
   "rating": "great",
   "summary": "Light breeze early, breeze picks up after lunch",
   "wind_kn_avg": 12.5,
   "gust_kn_max": 22.9,
   "swell_m_avg": 1.3,
   "rain_mm": 1.3,
   "sst_c_avg": 16.5,
   "sunrise": "2026-10-25T06:10:00+13:00",
   "sunset": "2026-10-25T20:05:00+13:00"
  }
 ],
 "windows": [
  {
   "start": "2026-11-01T07:00:00+13:00",
   "end": "2026-11-01T11:00:00+13:00",
   "score": 10,
   "rating": "great",
   "headline": "Sunday 7am\u201311am looks great",
   "advice": "Get there for 7am. Fish the turn of the low around 7:23am \u2014 that's usually when they come on the bite.",
   "reasons": [
    "Wind 7\u20137 kn",
    "Small swell ~0.2 m",
    "Low tide 7:23am",
    "Dry"
   ]
  }
 ],
 "tides": [
  {
   "time": "2026-10-25T01:30:00+13:00",
   "type": "low",
   "height_m": -1.42
  },
  {
   "time": "2026-10-25T07:43:00+13:00",
   "type": "high",
   "height_m": 1.42
  }
 ],
 "hourly": [
  {
   "time": "2026-10-25T00:00:00+13:00",
   "wind_kn": 10.4,
   "gust_kn": 14.5,
   "wind_dir_deg": 182,
   "swell_m": 1.16,
   "swell_period_s": 5,
   "sst_c": 16.7,
   "tide_m": -1.03,
   "rain_mm": 0,
   "score": 8.5
  },
  {
   "time": "2026-10-25T01:00:00+13:00",
   "wind_kn": 9.7,
   "gust_kn": 13.5,
   "wind_dir_deg": 182,
   "swell_m": 1.18,
   "swell_period_s": 5,
   "sst_c": 16.6,
   "tide_m": -1.38,
   "rain_mm": 0,
   "score": 8.5
  }
 ]
}
```
