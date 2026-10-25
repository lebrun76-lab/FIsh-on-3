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

## Engine integration (fishon_engine 2.1.0, PR #5 `feat/site-feedback`)

Status: local only. The engine is a read-only clone at `/workspace/fish-engine-site` (branch `feat/site-feedback`, HEAD `2d9bd8b`; PRs stack #1→#5), installed into `jobs/.venv` with `pip install -e "/workspace/fish-engine-site[sstmap]"`. Nothing engine-side was edited. `/workspace/fish-engine` (another agent's working copy) is not used.

**The engine now emits this contract itself.** `forecast_spot()` returns a v1 `SpotForecast`; `jobs/run_forecasts.py::site_payload()` is a pass-through that:
- runs `fishon_engine.contract.validate_v1()` (0 problems on all 23 spots in run `905a3a3b`; problems would be stored in `manifest.json → contract_problems`),
- drops `days[].blocks_3h` (3-hourly blocks kept for the Streamlit app) and the internal `cache` block from the public payload (about 115 KB per spot instead of ~200 KB),
- adds `run_id` and `mapper_version` (`2026-10-26.1`).
Engine 2.0 output (no `api_version`) still goes through the old mapper, now `legacy_to_v1()`. The job fetches `model_runs` once per run (5 small GETs) and shares it across spots.

### What v1 carries now (all additive to the original draft)
| Area | Fields | Site use |
|---|---|---|
| Hourly series | `hourly[]` every hour (`hourly_step_h: 1`, 240 rows for 10 days, all `+13:00`): `wind_kn, gust_kn, wind_dir_deg, wave_m` (total sea), `swell_m` (swell only), `swell_period_s, sst_c, tide_m, rain_mm, score, rating, wind_rel, light, tide_phase` | Charts (wind/gust, waves + swell, SST), safety check |
| Windows + verdict | `windows[]`: up to 3 per day, time-ordered, each with `date, wind_kn, gust_max_kn, wind_from, wind_rel, wave_m, swell_m, swell_period_s, rain_mm, confidence`. `verdict` = engine's pick, incl. `window{start,end}`; advice adds "Also good: …" | Windows grouped by day; the verdict's window is badged "Engine pick". The loader only re-derives a verdict once `verdict.window.end` has passed. |
| Swell vs waves | `wave_m` / `days[].wave_m_avg` = total significant wave height (what scoring uses); `swell_m` / `swell_m_avg` = swell only | Both shown ("0.8 m waves (swell 0.3 m @ 5 s)"); safety uses `wave_m` |
| Tides | `tides[].type` (was `kind`), per-event `datum: "chart_datum" \| "msl"` and `source`; `tide_datum` enum; `tide_source` (nearest LINZ standard or secondary port); `spot.tide_port_id/tide_port_km` | Friendly datum text; "tides: LINZ Mātiatia Bay (9.4 km away)" |
| Provenance | `model_run` ("ECMWF IFS 2026-10-25T00:00Z (latest run …)"), `model_runs{model: init UTC}`, `spot.forecast_point{lat,lon,cell_selection,model_cell,note}`, `spot.marine_point`, `timezone`, `attribution[]`, `warnings[]` | Header strip on the spot page |
| Daily aggregates | `days[].wind_kn_avg, wind_kn_max, gust_kn_max, swell_m_avg, wave_m_avg, rain_mm, sst_c_avg, best_window{…}, windows` (count) | Outlook cards |
| Species | top-level `species[]` once per forecast, with `changes[{date,status}]` inside the range (`days[].species` removed) | "What's on" cards show "→ peak from Sun 1 Nov" |

Ratings stay 4-band (great ≥ 7.5, good ≥ 6, marginal ≥ 4.5, poor). Confidence is a lead-time heuristic (≤ 2 days high, ≤ 6 medium, else low).

### SST map (PR #3)
`fishon_engine.sstmap.fetch_grid()` → one batched Open-Meteo Marine POST for every sea cell of a 0.5° grid (34–48°S, 166–179°E; 663 cells). **It counts as ~663 location-calls** against the Open-Meteo quota, so the job builds it once per run (engine-cached 6 h) and writes `web/data/sst/latest.json` (~67 KB: grid, 1 °C isotherms, Natural Earth land, the engine's plain-English `notes`, and per-spot `sst_c`, nearby isotherms and warm-edge `{min_c,max_c,warm_km,warm_dir}`) plus `web/public/sst/sst_latest.png` (engine render). Supabase: `sst_maps(run_id, valid_time, step_deg, api_calls, payload)`. `--no-sst` skips it.
Site: `SstMap` (server-renderable responsive SVG, no client JS). Spot pages (Pro) show a ±2.5° crop around the spot's marine point with a caption from `spots[id]`; Where to go shows the whole country with the warmest/coldest water and the biggest breaks. Caveat on both: 0.5° (~55 km) shows water masses, not rips or tide lines; shallow bays read warm.

### The 12 site-feedback items: checked against run `905a3a3b` (26 Oct 2026, 12:25am NZDT)
| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Packaging | ✅ Fixed | `pyproject.toml` 2.1.0, extras `[sstmap,test]`; `pip install -e` works; 89 tests pass |
| 2 | SST warmth | ⚠️ Checked, not corrected | Values unchanged in kind (Hauraki 16.9 °C vs 17.1 before). Engine compared with NOAA Coral Reef Watch: +0.22 °C mean, positive at all 21 spots, within ±0.9 °C; surfaced as a `warnings[]` line. No bias correction applied. |
| 3 | Optimistic scores | ✅ Mostly fixed | Day scores ≥ 8: 1.3% (claim 1.4%); median best-window 5.8. But the headline verdict is the max over ~30 windows, so 12/23 spots still headline "great" (7.6–8.8). |
| 4 | Gust ratio | ✅ Fixed (coast) | Hourly gust/mean median 1.36–1.52 at all 21 coastal spots. Lakes 2.2–2.8 (land cells, light winds). |
| 5 | Hourly series | ✅ Fixed | 1-hourly, 24 rows/day, offsets correct (no DST change in range to test 23/25) |
| 6 | Multiple windows + verdict | ✅ Fixed | 1–3 per day (132/54/44 days); verdict carries `window` |
| 7 | `kind` → `type` | ✅ Fixed | |
| 8 | Datum | ✅ Fixed | Per-event `datum` + enum `tide_datum`; lakes `null` |
| 9 | Swell vs waves | ✅ Fixed | `wave_m ≥ swell_m` on 100% of hours |
| 10 | `model_run` + daily aggregates | ✅ Fixed | 5 `model_runs`; aggregates present (minor: `gust_kn_max` can sit slightly below the hourly max, e.g. Kaikōura Mon 11.7 vs 12.8 kn) |
| 11 | Spot fields | ✅ Fixed | lat/lon/island/species/tags + `forecast_point`, `marine_point`, `tide_port_km` |
| 12 | Species once | ✅ Fixed | Top-level `species[]` with `changes[]`; 101/118 entries are still "no seasonal data" |

### Remaining engine issues (for Forecast Brain)
1. **Marine point still on land.** Weather points moved to sea, but `spot.marine_point` didn't: 13 of 21 coastal spots get a marine cell Open-Meteo reports at 3–71 m elevation (Dunedin 71 m, Banks Peninsula 59 m, East Cape 52 m). Waves/SST look plausible but should come from a sea cell like `forecast_point`.
2. **Verdict optimism.** Day scores are calibrated, but "best of 10 days" makes "great" the common headline. Suggest scoring the verdict against the next 3 days, or returning the best-in-3-days alongside.
3. **SST bias** documented but uncorrected (+0.22 °C mean). Fine for now; the site shows the warning.
4. **Species seasons**: most species have no seasonal data, so the site falls back to generic tactics.
5. **"Poor" windows**: days with nothing fishable still return a `poor` window ("No good window. Least-bad: …"). OK, but consider `windows: []` plus a day summary.
6. **SST map**: Firth of Thames/Tasman Bay cells read warm, Marlborough and Nelson share a cell, some coastal cells are null (engine caveats, shown in the site caption).

## Types (site copy: `web/src/lib/types.ts`)
```ts
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
  confidence?: "high" | "medium" | "low"; // v1.1: lead-time heuristic (<=2 d high, <=6 d medium)
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
  windows?: number;                   // v1.1: number of windows that day
  moon?: { phase: string; age_days: number; illumination_pct: number; near_new_or_full: boolean };
  species?: SpeciesStatus[];     // engine 2.0 only; 2.1 sends SpotForecast.species once
}

export interface Verdict {
  rating: Rating;
  score: number;                // best score over the period
  headline: string;             // "Go Saturday morning"
  advice: string;               // the plain-English paragraph shown first
  confidence: "high" | "medium" | "low";
  window?: { start: string; end: string } | null; // v1.1: the window the verdict refers to
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
```

## Sample `GET /v1/spots/hauraki_gulf/forecast` (real engine 2.1 output, arrays truncated)

```json
{
 "api_version": "1",
 "spot": {
  "id": "hauraki_gulf",
  "name": "Hauraki Gulf",
  "region": "Auckland",
  "island": "North",
  "lat": -36.7,
  "lon": 175.0,
  "species": [
   "Snapper",
   "Kingfish",
   "Kahawai",
   "Trevally",
   "John Dory",
   "Gurnard"
  ],
  "notes": "Auckland’s playground. Huge variety of spots from shore and boat.…",
  "tags": [
   "coastal",
   "boat",
   "shore"
  ],
  "coastal": true,
  "facing_deg": 60,
  "facing_note": "East Auckland/inner Gulf shores face NE-E",
  "tide_port": "Mātiatia Bay",
  "tide_port_id": "daily:Mātiatia Bay",
  "tide_port_km": 9.4,
  "tide_note": "",
  "forecast_point": {
   "lat": -36.7,
   "lon": 175.0,
   "cell_selection": "sea",
   "model_cell": {
    "lat": -36.731106,
    "lon": 175.03937,
    "elevation_m": 0.0
   },
   "note": null
  },
  "marine_point": {
   "lat": -36.7,
   "lon": 175.0,
   "model_cell": {
    "lat": -36.708336,
    "lon": 174.95836,
    "elevation_m": 0.0
   }
  }
 },
 "generated_at": "2026-10-26T00:25:49.461201+13:00",
 "model_run": "ECMWF IFS 2026-10-25T00:00Z (latest run ingested by Open-Meteo best_match)",
 "sources": [
  "Open-Meteo (CC BY 4.0)",
  "Tide predictions: Land Information New Zealand (LINZ), CC BY 4.0. Not for navigation.",
  "Tides: LINZ Mātiatia Bay"
 ],
 "verdict": {
  "rating": "great",
  "score": 8.2,
  "headline": "Go Monday early morning",
  "advice": "Mon 5-8am, gentle cross-offshore NW 8 kn, 0.1 m sea @ 3 s, rising tide, high 7:54am, dawn - try snapper: soft-baits or berleyed baits along reef edges and work-ups. Also good: Wed 28 Oct, Sun 1 Nov, Mon 2 Nov.",
  "confidence": "high",
  "window": {
   "start": "2026-10-26T05:00:00+13:00",
   "end": "2026-10-26T08:00:00+13:00"
  }
 },
 "days": [
  {
   "date": "2026-10-26",
   "score": 7.7,
   "rating": "great",
   "summary": "Excellent - go fishing. Gentle winds all day (~10 kn); 0.3 m sea. Best: Mon 5-8am.",
   "wind_kn_avg": 10.1,
   "gust_kn_max": 19.0,
   "swell_m_avg": 0.11,
   "rain_mm": 0,
   "sst_c_avg": 17.1,
   "sunrise": "2026-10-26T06:22:08+13:00",
   "sunset": "2026-10-26T19:46:09+13:00",
   "wave_m_avg": 0.26,
   "wind_kn_max": 14.5,
   "label": "Mon 26 Oct",
   "confidence": "high",
   "verdict_text": "Excellent - go fishing",
   "best_window": {
    "start": "2026-10-26T05:00:00+13:00",
    "end": "2026-10-26T08:00:00+13:00",
    "score": 8.2,
    "rating": "great",
    "headline": "Mon 5-8am looks great",
    "advice": "Mon 5-8am, gentle cross-offshore NW 8 kn, 0.1 m sea @ 3 s, rising tide, high 7:54am, dawn - try snapper: soft-baits or berleyed baits along reef edges and work-ups",
    "reasons": [
     "Wind NW 8 kn (cross-offshore)",
     "Gusts to 12 kn",
     "Waves 0.1 m (swell 0.1 m @ 3 s)",
     "Dry",
     "Dawn/dusk",
     "Offshore breeze",
     "Run-in to high tide"
    ],
    "confidence": "high",
    "date": "2026-10-26",
    "wind_kn": 8.0,
    "gust_max_kn": 12.1,
    "wind_from": "NW",
    "wind_rel": "cross-offshore",
    "wave_m": 0.1,
    "swell_m": 0.1,
    "swell_period_s": 3.0,
    "rain_mm": 0
   },
   "best_window_text": "Mon 5-8am, gentle cross-offshore NW 8 kn, 0.1 m sea @ 3 s, rising tide, high 7:54am, dawn - try snapper: soft-baits or berleyed baits along reef edges and work-ups",
   "windows": 3,
   "moon": {
    "phase": "full moon",
    "age_days": 14.6,
    "illumination_pct": 100,
    "near_new_or_full": true
   }
  }
 ],
 "windows": [
  {
   "start": "2026-10-26T05:00:00+13:00",
   "end": "2026-10-26T08:00:00+13:00",
   "score": 8.2,
   "rating": "great",
   "headline": "Mon 5-8am looks great",
   "advice": "Mon 5-8am, gentle cross-offshore NW 8 kn, 0.1 m sea @ 3 s, rising tide, high 7:54am, dawn - try snapper: soft-baits or berleyed baits along reef edges and work-ups",
   "reasons": [
    "Wind NW 8 kn (cross-offshore)",
    "Gusts to 12 kn",
    "Waves 0.1 m (swell 0.1 m @ 3 s)",
    "Dry",
    "Dawn/dusk",
    "Offshore breeze",
    "Run-in to high tide"
   ],
   "confidence": "high",
   "date": "2026-10-26",
   "wind_kn": 8.0,
   "gust_max_kn": 12.1,
   "wind_from": "NW",
   "wind_rel": "cross-offshore",
   "wave_m": 0.1,
   "swell_m": 0.1,
   "swell_period_s": 3.0,
   "rain_mm": 0
  },
  {
   "start": "2026-10-26T10:00:00+13:00",
   "end": "2026-10-26T13:00:00+13:00",
   "score": 7.1,
   "rating": "good",
   "headline": "Mon 10am-1pm looks good",
   "advice": "Mon 10am-1pm, gentle cross-shore N 8 kn, 0.2 m sea @ 4 s, falling tide, low 1:58pm - try snapper: soft-baits or berleyed baits along reef edges and work-ups",
   "reasons": [
    "Wind N 8 kn (cross-shore)",
    "Gusts to 12 kn",
    "Waves 0.2 m (swell 0.1 m @ 4 s)",
    "Dry",
    "Falling pressure"
   ],
   "confidence": "high",
   "date": "2026-10-26",
   "wind_kn": 8.1,
   "gust_max_kn": 11.5,
   "wind_from": "N",
   "wind_rel": "cross-shore",
   "wave_m": 0.2,
   "swell_m": 0.1,
   "swell_period_s": 4.0,
   "rain_mm": 0
  }
 ],
 "tides": [
  {
   "time": "2026-10-26T01:34:00+13:00",
   "type": "low",
   "height_m": 0.7,
   "datum": "chart_datum",
   "source": "LINZ"
  },
  {
   "time": "2026-10-26T07:54:00+13:00",
   "type": "high",
   "height_m": 2.9,
   "datum": "chart_datum",
   "source": "LINZ"
  }
 ],
 "hourly": [
  {
   "time": "2026-10-26T00:00:00+13:00",
   "wind_kn": 7.3,
   "gust_kn": 12.2,
   "wind_dir_deg": 233,
   "swell_m": 0.1,
   "swell_period_s": 2.6,
   "sst_c": 17.1,
   "tide_m": 1.03,
   "rain_mm": 0.0,
   "score": 6.0,
   "wave_m": 0.16,
   "wind_rel": "offshore",
   "light": "dark",
   "tide_phase": "falling",
   "rating": "good"
  },
  {
   "time": "2026-10-26T01:00:00+13:00",
   "wind_kn": 6.8,
   "gust_kn": 10.3,
   "wind_dir_deg": 248,
   "swell_m": 0.1,
   "swell_period_s": 2.8,
   "sst_c": 17.1,
   "tide_m": 0.74,
   "rain_mm": 0.0,
   "score": 5.8,
   "wave_m": 0.14,
   "wind_rel": "offshore",
   "light": "dark",
   "tide_phase": "falling",
   "rating": "marginal"
  }
 ],
 "data_status": "engine",
 "engine_version": "2.1.0",
 "hourly_step_h": 1,
 "timezone": "Pacific/Auckland",
 "model_runs": {
  "ecmwf_ifs": "2026-10-25T00:00Z",
  "ncep_gfs013": "2026-10-25T06:00Z",
  "dwd_icon": "2026-10-25T06:00Z",
  "meteofrance_wave": "2026-10-24T12:00Z",
  "ecmwf_wam": "2026-10-25T00:00Z"
 },
 "tide_source": "LINZ Mātiatia Bay",
 "tide_datum": "chart_datum",
 "tide_series": [
  {
   "time": "2026-10-26T00:00:00+13:00",
   "height_m": 1.03
  },
  {
   "time": "2026-10-26T00:30:00+13:00",
   "height_m": 0.86
  }
 ],
 "species": [
  {
   "name": "Snapper",
   "status": "in season",
   "how": "soft-baits or berleyed baits along reef edges and work-ups",
   "notes": [
    "Inshore spawning aggregations Oct-Mar, peak Nov-Dec; spawning starts at roughly 14.8-16 C sea temperature."
   ],
   "sources": [
    "Parsons et al. 2014, 'Snapper (Chrysophrys auratus): a review of life history and key vulnerabilities in New Zealand', NZ J Marine & Freshwater Research 48(2). https://www.tandfonline.com/doi/full/10.1080/00288330.2014.892013",
    "NIWA: spring spawning migrations at about 16 C. https://niwa.co.nz/news/will-it-be-fintastic-fishing-year"
   ],
   "changes": [
    {
     "date": "2026-11-01",
     "status": "peak"
    }
   ]
  }
 ],
 "warnings": [
  "Sea temperature is the Open-Meteo marine model; vs NOAA Coral Reef Watch 5 km satellite SST on 23 Oct 2026 it was within about +/-0.9 C at all 21 coastal spots (docs/SST_CHECK.md)."
 ],
 "attribution": [
  "Weather & marine data: Open-Meteo.com (CC BY 4.0)",
  "Tide predictions: Land Information New Zealand (LINZ), CC BY 4.0. Not for navigation."
 ],
 "mapper_version": "2026-10-26.1",
 "run_id": "905a3a3b-e653-411c-a2c3-bbcaf63f14dc"
}
```
