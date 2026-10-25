# Forecast Brain API — v1 contract

This is the boundary between the website and **Forecast Brain**, the Python forecast package another team member is building.
The website only depends on these JSON shapes. Since 2026-10-25 the prototype serves **real engine output**: `jobs/run_forecasts.py` runs `fishon_engine` (PR #2) and writes v1 payloads to `web/data/forecasts/latest/*.json`, read by `src/lib/forecasts.ts`. `src/lib/mock.ts` is only a fallback, labelled `data_status: "mock-fallback"` and shown with a yellow MOCK FALLBACK banner.
The TypeScript source of truth is `src/lib/types.ts`. Forecast Brain should publish the same schema with Pydantic models and generate OpenAPI from them.

## Conventions
- Times are ISO 8601 with offset, in `Pacific/Auckland` (e.g. `2026-10-26T06:00:00+13:00`).
- Units are fixed: wind and gust in **knots**; swell and tide in **metres**; period in **s**; SST in **°C**; rain in **mm**.
- Null means "not applicable or not available" (freshwater spots, or beyond the marine horizon of about 9 days).
- `score` is 0–10 and `rating` is `great` (≥7.5) | `good` (≥6) | `marginal` (≥4.5) | `poor`. These follow the engine's verdict bands (engine "Fair" = `marginal`; engine "Marginal" and "Poor" both = `poor`). The mock fallback still uses its old 8 / 6.5 / 4.5 bands.
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

## Engine integration (fishon_engine 2.0.0a1) — mapping, gaps, proposed changes

Status: local only. Nothing in `/workspace/fish-engine` was edited. The site's job imports it through a `.pth` file in `jobs/.venv`.
The mapping lives in one function, `to_v1()` in `jobs/run_forecasts.py`, and has its own `MAPPER_VERSION`.

### Field mapping (engine `forecast_spot()` → v1)
| v1 field | Engine source | Notes |
|---|---|---|
| `spot.*` | `fishon_engine.SPOTS[id]` (lat, lon, island, species, notes, tags) + output `spot` (facing_deg, facing_note, tide_port) | The engine's output `spot` has no lat/lon/island/species, so the job reads them from `SPOTS`. |
| `generated_at` | `generated_at` | Already NZ time with offset (`+13:00`). |
| `model_run` | — | **Gap.** The engine doesn't expose the upstream model run. |
| `sources[]` | `attribution[]` + `"Tides: " + tide_source` | Covers Open-Meteo CC BY 4.0, LINZ CC BY 4.0, "Not for navigation". |
| `verdict` | Derived: the best `days[].best_window` over the period | **Gap.** The engine has no overall verdict. `headline` = "Go " + the first clause of the window text; `advice` = the window `text`; `confidence` = that day's confidence. |
| `days[].score` / `rating` / `summary` | `days[].score` / `rating(score)` / `verdict` | **Score can be `null`** (late at night: "No daylight left today"). v1 typed it as a number. |
| `days[].wind_kn_avg`, `gust_kn_max`, `swell_m_avg`, `rain_mm` | Aggregated from `blocks_3h` (daylight blocks; rain over the whole day) | **Gap.** The engine has no daily aggregates. |
| `days[].sst_c_avg`, `sunrise`, `sunset` | `days[].sst_c`, `sunrise`, `sunset` | |
| `windows[]` | One per day from `days[].best_window`, sorted by score | **Gap.** The engine gives exactly one window per day, never several. `advice` = `text`; `reasons` = `why[]` + formatted wind/gust/sea/rain; `headline` is site-built. |
| `tides[]` | `days[].tides[]`, with `kind` → `type` | **Datum mismatch.** v1 said "relative to MSL". LINZ heights are **above chart datum**, while the Open-Meteo fallback is relative to MSL. See `tide_datum`. |
| `hourly[]` | `days[].blocks_3h[]`: `wind_kn`, `gust_max_kn`→`gust_kn`, `wind_from_deg`→`wind_dir_deg`, `sea_m`→`swell_m`, `swell_period_s`, `sst_c`, `rain_mm`, `score`; `tide_m` = `fishon_engine.tides.height_at()` at the block midpoint | **Gap.** The engine doesn't output hourly data, so the points are **3-hourly** (`hourly_step_h: 3`). `sea_m` is total wave height, not swell only. |
| `tide_series[]` (new) | `tides.height_at()` on the engine's extremes, every 30 min | Gives a smooth tide chart. |

### Additive fields the site now uses (proposed v1.1, non-breaking)
`data_status` (`engine` / `mock-fallback`), `fallback_reason`, `stale` (more than 6 h old), `run_id`, `engine_version`, `hourly_step_h`, `tide_source`, `tide_datum`, `tide_series[]`, `warnings[]`.
Also `spot.facing_deg/facing_note/tide_port/tide_note`, `windows[].confidence`, and `days[].label/confidence/verdict_text/best_window_text/moon/species[]`.
`species[]` is `{name, status: closed|peak|in season|off-peak|no seasonal data, how, notes[], sources[]}`.

### Proposed contract changes (for Forecast Brain to accept or reject; nothing changed engine-side)
1. **Expose `hourly[]` in the engine output**, using the per-hour rows from `score_hour()`, plus `tide_m` and `tide_phase`. The site currently rebuilds a 3-hourly series from `blocks_3h`.
2. **Emit an overall `verdict`** (rating, score, headline, advice, confidence) and **up to N windows across the period**, not just one best window per day. Wording would then stay in the engine.
3. **Emit `rating` alongside `verdict` text** as an enum (5 bands: excellent/good/fair/marginal/poor). The site could then move to 5 bands, or map them as above.
4. **Tides: rename `kind` → `type`, or accept `kind` in v1**, and add `datum: "chart_datum" | "msl"` per event. Change the v1 wording from "relative to MSL" to "see `tide_datum`".
5. **Daily aggregates** (wind avg, gust max, sea avg, rain total) computed in the engine, so every client agrees.
6. **Split `sea_m` into `wave_m` and `swell_m`.** Open-Meteo returns both; v1 called the field "swell".
7. **`score: null` is allowed for days with no daylight left.** v1 now types `DaySummary.score` as `number | null`.
8. **`model_run`**: return the Open-Meteo model/run time, or drop the field from v1.
9. **Packaging**: add a `pyproject.toml`, so `pip install -e /path/to/fish-engine` works and the site job can pin a version.

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
