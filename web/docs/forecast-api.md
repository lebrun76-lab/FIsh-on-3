# Forecast Brain API: v1 contract

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

## Engine integration (fishon_engine 2.2.0, PR #6 `feat/engine-round-d`)

Status: local only. The engine is a read-only clone at `/workspace/fish-engine-site` (branch `feat/engine-round-d`, HEAD `f0eb16d`; PRs stack #1→#6; 126 engine tests pass), installed into `jobs/.venv` with `pip install -e "/workspace/fish-engine-site[sstmap]"`. Nothing engine-side was edited. `/workspace/fish-engine` (another agent's working copy) is not used.

**The engine now emits this contract itself.** `forecast_spot()` returns a v1 `SpotForecast`; `jobs/run_forecasts.py::site_payload()` is a pass-through that:
- runs `fishon_engine.contract.validate_v1()` (0 problems on all 23 spots in run `2693d266`; problems would be stored in `manifest.json → contract_problems`),
- drops `days[].blocks_3h` (3-hourly blocks kept for the Streamlit app) and the internal `cache` block from the public payload (about 115 KB per spot instead of ~200 KB),
- adds `run_id` and `mapper_version` (`2026-10-26.1`).
Engine 2.0 output (no `api_version`) still goes through the old mapper, now `legacy_to_v1()`. The job fetches `model_runs` once per run (5 small GETs) and shares it across spots.

### What v1 carries now (all additive to the original draft)
| Area | Fields | Site use |
|---|---|---|
| Hourly series | `hourly[]` every hour (`hourly_step_h: 1`, 240 rows for 10 days, all `+13:00`): `wind_kn, gust_kn, wind_dir_deg, wave_m` (total sea), `swell_m` (swell only), `swell_period_s, sst_c, tide_m, rain_mm, score, rating, wind_rel, light, tide_phase` | Charts (wind/gust, waves + swell, SST), safety check |
| Windows + verdict | `windows[]`: time-ordered (2.2: up to 3 per day within 1.5 of the best; feat/windows-and-copy: every window ≥ 4.5, up to 4 a day), each with `date, wind_kn, gust_max_kn, wind_from, wind_rel, wave_m, swell_m, swell_period_s, rain_mm, confidence`. `verdict` = engine's pick, incl. `window{start,end}`; advice adds "Also good: …" | Windows grouped by day; the verdict's window is badged "The pick". The loader only re-derives a verdict once `verdict.window.end` has passed. |
| Swell vs waves | `wave_m` / `days[].wave_m_avg` = total significant wave height (what scoring uses); `swell_m` / `swell_m_avg` = swell only | Both shown ("0.8 m waves (swell 0.3 m @ 5 s)"); safety uses `wave_m` |
| Tides | `tides[].type` (was `kind`), per-event `datum: "chart_datum" \| "msl"` and `source`; `tide_datum` enum; `tide_source` (nearest LINZ standard or secondary port); `spot.tide_port_id/tide_port_km` | Friendly datum text; "tides: LINZ Mātiatia Bay (9.4 km away)" |
| Provenance | `model_run` ("ECMWF IFS 2026-10-25T00:00Z (latest run …)"), `model_runs{model: init UTC}`, `spot.forecast_point{lat,lon,cell_selection,model_cell,note}`, `spot.marine_point`, `timezone`, `attribution[]`, `warnings[]` | Header strip on the spot page |
| Daily aggregates | `days[].wind_kn_avg, wind_kn_max, gust_kn_max, swell_m_avg, wave_m_avg, rain_mm, sst_c_avg, best_window{…}, windows` (count) | Outlook cards |
| Species | top-level `species[]` once per forecast, with `changes[{date,status}]` inside the range (`days[].species` removed) | "What's on" cards show "→ peak from Sun 1 Nov" |

Ratings stay 4-band (great ≥ 7.5, good ≥ 6, marginal ≥ 4.5, poor).

### New in engine 2.2 (PR #6) and how the site uses it
| Area | Fields | Site use |
|---|---|---|
| 3-day verdict | `verdict.horizon_days` (3), `horizon_end`; `score`/`rating`/`window` = best fishable window in the next 3 days | Label "Best in the next 3 days". The loader re-derives only after `verdict.window.end` has passed, and then only from windows starting within 3 days of now. |
| Better later | `verdict.best_later{start,end,date,score,rating,headline,advice,confidence}` = best fishable window after the horizon (can be **lower** than the headline) | "Better later: …" (green) only when its score beats the headline or there is no window; otherwise a small grey "After that: …" line. Free users get "a great window shows up later this week. See it with Pro". |
| No window | `verdict.window: null`, `verdict.no_window_reason`, `days[].best_window: null`, `days[].no_window_reason`; `windows[]` holds fishable windows only | Headline "No fishable window in the next 3 days"; the reason is rewritten in plain words (`noWindowText()`: "no stretch of daylight scores 4.5/10 or better. Even at the best time: wind…"). Day-by-day list shows a red "No fishable window" card for that day; outlook cards say "No fishable window". |
| Least-bad | `verdict.least_bad`, `days[].least_bad_window` (window object, `label: "least-bad (not recommended)"`) | Separate grey dashed card "LEAST-BAD OPTION · NOT RECOMMENDED", never badged or styled like a window. "The call" says "Stay home … Next good chance: …". |
| Confidence | `windows[].confidence_detail{level, lead_days, lead_level, agreement good/fair/poor/unknown, model_scores{"wind:ecmwf_ifs025":…}, score_spread, models_missing, gap_hours, downgrades[]}`; `days[].lead_confidence`. Spread < 0.75 good, < 1.5 fair, ≥ 1.5 poor; each 1.5 of spread drops one level (max 2), a data gap drops one; never above the lead level. | `confidenceText()`: "High confidence: the weather models broadly agree." / "Medium confidence: the weather models disagree (they score it anywhere from 6.9 to 8.4 out of 10)." / "…and it's 6 days out." Shown under the verdict and on every window card. |
| Daily gusts | `days[].gust_kn_max` / `wind_kn_max` now over **all** hours; `gust_kn_max_daylight` / `wind_kn_max_daylight` added | Outlook keeps `gust_kn_max` |
| Marine point | `spot.marine_point{lat,lon,model_cell{elevation_m},note}` | Header strip |

### New in feat/windows-and-copy (PR #8) and how the site uses it
All additive. Older output without these fields still loads: `lib/call.ts` checks `listsAllWindows()` and falls back to the old rules.
| Area | Fields | Site use |
|---|---|---|
| Every window | `windows[]` = every separate window scoring ≥ 4.5 (3 to 5 h, at least 2 h apart, up to 4 a day); `days[].windows` = count | Pro day-by-day list shows them all. The hourly-scores fallback in `bestCall()` now only runs on older output: once the engine's listed windows have passed there's nothing fishable left. |
| near_best | `windows[].near_best` (bool, also on `days[].best_window` / `least_bad_window`): within 1.5 of the day's best | `Call.also` = other live near-best windows on the pick's day. Pro: "Also worth a look today: 6–9pm (good, 6.4)." under the call; free: "Another good window today too. See it with Pro." Window cards that aren't the pick say "Also worth a look" or "Fishable, but well short of the day's best". On older output `isNearBest()` works it out from the day's best score. The windows API takes `?near_best=1`. |
| Today's score | `days[].score_remaining`, `remaining_from`, `score_full_day` | `dayScore()`: today shows `score_remaining` (falls back to `score`), headed "Rest of today, from 8am"; other days show `score`. `score_full_day` isn't shown. |
| Stale today | `remaining_from` | `todayStale()`: if the current hour is past `remaining_from`, the header strip says "Today's score counts from 8am, when this forecast was made. A fresh one is due." The job has no on-demand refresh, so it's a note only. |
| Copy | Engine sentences have no dashes | `lib/plain.ts` stays as a safety net for older output. Site copy checked by `scripts/check-calls.ts` (no em dashes or spaced dashes, no hype words). |

### SST map (PR #3)
`fishon_engine.sstmap.fetch_grid()` → one batched Open-Meteo Marine POST for every sea cell of a 0.5° grid, coastal cells only since 2.2 (288 cells). **It costs ~469 Open-Meteo calls** (was ~663) against the Open-Meteo quota, so the job builds it once per run (engine-cached 6 h) and writes `web/data/sst/latest.json` (~67 KB: grid, 1 °C isotherms, Natural Earth land, the engine's plain-English `notes`, and per-spot `sst_c`, nearby isotherms and warm-edge `{min_c,max_c,warm_km,warm_dir}`) plus `web/public/sst/sst_latest.png` (engine render). Supabase: `sst_maps(run_id, valid_time, step_deg, api_calls, payload)`. `--no-sst` skips it.
Site: `SstMap` (server-renderable responsive SVG, no client JS). Spot pages (Pro) show a ±2.5° crop around the spot's marine point with a caption from `spots[id]`; Where to go shows the whole country with the warmest/coldest water and the biggest breaks. Caveat on both: 0.5° (~55 km) shows water masses, not rips or tide lines; shallow bays read warm.

### Round D check: run `2693d266` (26 Oct 2026, 1:08am NZDT, engine 2.2.0)
| Item | Status | Evidence |
|---|---|---|
| Verdict optimism | ✅ Much better | "Great" headlines 8/23 (was 12/23): Bay of Islands, Bay of Plenty, Coromandel, Far North, Hauraki Gulf, Hawke's Bay, Kaikōura, Marlborough Sounds. Good 7, marginal 5, poor (no window) 3: Bluff 1.1, Catlins 4.0, Fiordland 2.1. |
| Poor "windows" | ✅ Fixed | `windows[]` is fishable only; 69/230 days have `best_window: null` with a reason and a separate `least_bad_window` (Fiordland 9 days, Greymouth/Haast 8, Bluff 7). |
| Gust max | ✅ Fixed | `days[].gust_kn_max` ≥ hourly max on every day at every spot. Hourly gust/mean median 1.36–1.52 on the coast, 2.17–2.77 at the two lakes. |
| Model-agreement confidence | ✅ New | 310 windows: agreement good 44, fair 65, **poor 201**; confidence high 33, medium 61, low 216. Low dominates past day 2 (e.g. a Bluff window at lead 6: GFS wind scores 2.0 vs 7–8 for the others, spread 6.2). |
| Marine point on land | ⚠️ Partly fixed | 16/21 coastal spots now get a 0 m sea cell. 5 still request the display coordinates and Open-Meteo reports land elevation there: Banks Peninsula 59 m, Coromandel 42 m, Bay of Islands 40 m, Bluff 29 m, Greymouth 6 m (MARINE_POINTS.md says their cells are mostly sea, 0.54–1.0). Suggest pinning these 5 to cell centres too. |
| `best_later` | ⚠️ Note | Always set, even when lower than the headline (Far North 7.5 vs 7.8, East Cape 5.9 vs 6.1). The site only calls it "better" when it scores higher. |
| Species seasons | ❌ Still open | 95/118 entries "no seasonal data" (was 101): kingfish added at Wellington/East Cape/Hawke's Bay, trout/salmon at Southern Lakes. |
| SST bias | ⚠️ Documented, uncorrected | Warning line kept; SST_CHECK.md: within ±1.2 °C of NOAA CRW at night, no net bias. |
| Contract | ✅ | `validate_v1()` 0 problems on 23/23 spots. |

### Remaining engine issues (for Forecast Brain)
1. **Five marine points still on land** (above). Pin to cell centres.
2. **Species seasons** mostly missing; the site falls back to generic tactics.
3. **`best_later` semantics**: consider only setting it when it beats the headline, or add `better: true`.
4. **Confidence**: "poor" agreement on 65% of windows makes "low" the norm beyond day 2; check whether the 1.5 spread threshold is too strict for GFS-vs-ECMWF wind differences.
5. **SST bias** still uncorrected (site shows the warning).
6. **SST map** caveats unchanged (shallow bays warm, some cells shared/null).

## Types (site copy: `web/src/lib/types.ts`)
```ts
/**
 * Forecast Brain API contract (v1): the boundary between the website and the
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
```

## Sample `GET /v1/spots/hauraki_gulf/forecast` (real engine 2.2 output, arrays truncated to 2)

```json
{
 "api_version": "1",
 "attribution": [
  "Weather & marine data: Open-Meteo.com (CC BY 4.0)",
  "Tide predictions: Land Information New Zealand (LINZ), CC BY 4.0. Not for navigation."
 ],
 "data_status": "engine",
 "days": [
  {
   "best_window": {
    "advice": "Mon 5-8am, gentle cross-offshore NW 8 kn, 0.1 m sea @ 6 s, rising tide, high 7:54am, dawn - try snapper: soft-baits or berleyed baits along reef edges and work-ups",
    "confidence": "high",
    "confidence_detail": {
     "agreement": "fair",
     "downgrades": [],
     "gap_hours": 0,
     "lead_days": 0,
     "lead_level": "high",
     "level": "high",
     "model_scores": {
      "waves:ecmwf_wam": 8.2,
      "waves:meteofrance_wave": 8.2,
      "waves:ncep_gfswave025": 8.2,
      "wind:ecmwf_ifs025": 8.2,
      "wind:gfs_seamless": 8.4,
      "wind:icon_seamless": 9.2
     },
     "models_missing": [],
     "score_best_match": 8.2,
     "score_spread": 1.0
    },
    "date": "2026-10-26",
    "end": "2026-10-26T08:00:00+13:00",
    "gust_max_kn": 12.1,
    "headline": "Mon 5-8am looks great",
    "rain_mm": 0,
    "rating": "great",
    "reasons": [
     "Wind NW 8 kn (cross-offshore)",
     "Gusts to 12 kn"
    ],
    "score": 8.2,
    "start": "2026-10-26T05:00:00+13:00",
    "swell_m": 0.1,
    "swell_period_s": 6.0,
    "wave_m": 0.1,
    "wind_from": "NW",
    "wind_kn": 8.0,
    "wind_rel": "cross-offshore"
   },
   "best_window_text": "Mon 5-8am, gentle cross-offshore NW 8 kn, 0.1 m sea @ 6 s, rising tide, high 7:54am, dawn - try snapper: soft-baits or berleyed baits along reef edges and work-ups",
   "confidence": "high",
   "date": "2026-10-26",
   "gust_kn_max": 19.0,
   "gust_kn_max_daylight": 19.0,
   "label": "Mon 26 Oct",
   "lead_confidence": "high",
   "least_bad_window": null,
   "moon": {
    "age_days": 14.6,
    "illumination_pct": 100,
    "near_new_or_full": true,
    "phase": "full moon"
   },
   "no_window_reason": null,
   "rain_mm": 0,
   "rating": "great",
   "score": 7.7,
   "sst_c_avg": 17.1,
   "summary": "Excellent - go fishing. Gentle winds all day (~10 kn); 0.3 m sea. Best: Mon 5-8am.",
   "sunrise": "2026-10-26T06:22:08+13:00",
   "sunset": "2026-10-26T19:46:09+13:00",
   "swell_m_avg": 0.12,
   "verdict_text": "Excellent - go fishing",
   "wave_m_avg": 0.27,
   "wind_kn_avg": 10.1,
   "wind_kn_max": 14.5,
   "wind_kn_max_daylight": 14.5,
   "windows": 3
  },
  {
   "best_window": null,
   "best_window_text": "No fishable window on Tue 27 Oct: no daylight run of hours scores 4.5 (marginal) or more. Least-bad is Tue 6-9am at 4.2/10 (Wind NW 16 kn (cross-shore); Gusts to 22 kn; Waves 0.8 m (swell 0.2 m @ 5 s)).",
   "confidence": "high",
   "date": "2026-10-27",
   "gust_kn_max": 29.9,
   "gust_kn_max_daylight": 29.9,
   "label": "Tue 27 Oct",
   "lead_confidence": "high",
   "least_bad_window": {
    "advice": "No good window. Least-bad: Tue 6-9am, moderate cross-shore NW 16 kn, 0.8 m sea @ 5 s, rising tide, high 8:42am, dawn",
    "confidence": "high",
    "confidence_detail": {
     "agreement": "fair",
     "downgrades": [],
     "gap_hours": 0,
     "lead_days": 1,
     "lead_level": "high",
     "level": "high",
     "model_scores": {
      "waves:ecmwf_wam": 4.2,
      "waves:meteofrance_wave": 4.2,
      "waves:ncep_gfswave025": 4.2,
      "wind:ecmwf_ifs025": 4.2,
      "wind:gfs_seamless": 4.2,
      "wind:icon_seamless": 5.5
     },
     "models_missing": [],
     "score_best_match": 4.2,
     "score_spread": 1.3
    },
    "date": "2026-10-27",
    "end": "2026-10-27T09:00:00+13:00",
    "gust_max_kn": 22.4,
    "headline": "Tue 6-9am is the least-bad option",
    "label": "least-bad (not recommended)",
    "rain_mm": 0,
    "rating": "poor",
    "reasons": [
     "Wind NW 16 kn (cross-shore)",
     "Gusts to 22 kn"
    ],
    "score": 4.2,
    "start": "2026-10-27T06:00:00+13:00",
    "swell_m": 0.2,
    "swell_period_s": 5.0,
    "wave_m": 0.8,
    "wind_from": "NW",
    "wind_kn": 16.4,
    "wind_rel": "cross-shore"
   },
   "moon": {
    "age_days": 15.6,
    "illumination_pct": 99,
    "near_new_or_full": true,
    "phase": "full moon"
   },
   "no_window_reason": "No fishable window on Tue 27 Oct: no daylight run of hours scores 4.5 (marginal) or more. Least-bad is Tue 6-9am at 4.2/10 (Wind NW 16 kn (cross-shore); Gusts to 22 kn; Waves 0.8 m (swell 0.2 m @ 5 s)).",
   "rain_mm": 5.1,
   "rating": "poor",
   "score": 3.7,
   "sst_c_avg": 16.8,
   "summary": "Poor - stay home / sheltered water only. Fresh winds all day (~17 kn); 0.8 m sea; 5 mm rain.",
   "sunrise": "2026-10-27T06:20:57+13:00",
   "sunset": "2026-10-27T19:47:08+13:00",
   "swell_m_avg": 0.43,
   "verdict_text": "Poor - stay home / sheltered water only",
   "wave_m_avg": 0.79,
   "wind_kn_avg": 17.3,
   "wind_kn_max": 22.9,
   "wind_kn_max_daylight": 22.9,
   "windows": 0
  }
 ],
 "engine_version": "2.2.0",
 "generated_at": "2026-10-26T01:09:02.717912+13:00",
 "hourly": [
  {
   "gust_kn": 12.2,
   "light": "dark",
   "rain_mm": 0.0,
   "rating": "good",
   "score": 6.0,
   "sst_c": 17.1,
   "swell_m": 0.12,
   "swell_period_s": 2.0,
   "tide_m": 1.03,
   "tide_phase": "falling",
   "time": "2026-10-26T00:00:00+13:00",
   "wave_m": 0.2,
   "wind_dir_deg": 233,
   "wind_kn": 7.3,
   "wind_rel": "offshore"
  },
  {
   "gust_kn": 10.3,
   "light": "dark",
   "rain_mm": 0.0,
   "rating": "marginal",
   "score": 5.8,
   "sst_c": 17.0,
   "swell_m": 0.14,
   "swell_period_s": 1.8,
   "tide_m": 0.74,
   "tide_phase": "falling",
   "time": "2026-10-26T01:00:00+13:00",
   "wave_m": 0.18,
   "wind_dir_deg": 248,
   "wind_kn": 6.8,
   "wind_rel": "offshore"
  }
 ],
 "hourly_step_h": 1,
 "mapper_version": "2026-10-26.1",
 "model_run": "ECMWF IFS 2026-10-25T00:00Z (latest run ingested by Open-Meteo best_match)",
 "model_runs": {
  "dwd_icon": "2026-10-25T06:00Z",
  "ecmwf_ifs": "2026-10-25T00:00Z",
  "ecmwf_wam": "2026-10-25T06:00Z",
  "meteofrance_wave": "2026-10-25T00:00Z",
  "ncep_gfs013": "2026-10-25T06:00Z"
 },
 "run_id": "2693d266-c3fd-4102-82ce-014dafe90d52",
 "sources": [
  "Open-Meteo (CC BY 4.0)",
  "Tide predictions: Land Information New Zealand (LINZ), CC BY 4.0. Not for navigation."
 ],
 "species": [
  {
   "changes": [
    {
     "date": "2026-11-01",
     "status": "peak"
    }
   ],
   "how": "soft-baits or berleyed baits along reef edges and work-ups",
   "name": "Snapper",
   "notes": [
    "Inshore spawning aggregations Oct-Mar, peak Nov-Dec; spawning starts at roughly 14.8-16 C sea temperature."
   ],
   "sources": [
    "Parsons et al. 2014, 'Snapper (Chrysophrys auratus): a review of life history and key vulnerabilities in New Zealand', NZ J Marine & Freshwater Research 48(2). https://www.tandfonline.com/doi/full/10.1080/00288330.2014.892013",
    "NIWA: spring spawning migrations at about 16 C. https://niwa.co.nz/news/will-it-be-fintastic-fishing-year"
   ],
   "status": "in season"
  },
  {
   "changes": [],
   "how": "live-baits or jigs around pins and reefs",
   "name": "Kingfish",
   "notes": [],
   "sources": [],
   "status": "no seasonal data"
  }
 ],
 "spot": {
  "coastal": true,
  "facing_deg": 60,
  "facing_note": "East Auckland/inner Gulf shores face NE-E",
  "forecast_point": {
   "cell_selection": "sea",
   "lat": -36.7,
   "lon": 175.0,
   "model_cell": {
    "elevation_m": 0.0,
    "lat": -36.731106,
    "lon": 175.03937
   },
   "note": null
  },
  "id": "hauraki_gulf",
  "island": "North",
  "lat": -36.7,
  "lon": 175.0,
  "marine_point": {
   "lat": -36.708,
   "lon": 175.042,
   "model_cell": {
    "elevation_m": 0.0,
    "lat": -36.708336,
    "lon": 175.04167
   },
   "note": "Marine data (waves, SST) taken from a sea point -36.708, 175.042."
  },
  "name": "Hauraki Gulf",
  "notes": "Auckland’s playground. Huge variety of spots from shore and boat.",
  "region": "Auckland",
  "species": [
   "Snapper",
   "Kingfish"
  ],
  "tags": [
   "coastal",
   "boat"
  ],
  "tide_note": "",
  "tide_port": "Mātiatia Bay",
  "tide_port_id": "daily:Mātiatia Bay",
  "tide_port_km": 9.4
 },
 "tide_datum": "chart_datum",
 "tide_series": [
  {
   "height_m": 1.03,
   "time": "2026-10-26T00:00:00+13:00"
  },
  {
   "height_m": 0.86,
   "time": "2026-10-26T00:30:00+13:00"
  }
 ],
 "tide_source": "LINZ Mātiatia Bay",
 "tides": [
  {
   "datum": "chart_datum",
   "height_m": 0.7,
   "source": "LINZ",
   "time": "2026-10-26T01:34:00+13:00",
   "type": "low"
  },
  {
   "datum": "chart_datum",
   "height_m": 2.9,
   "source": "LINZ",
   "time": "2026-10-26T07:54:00+13:00",
   "type": "high"
  }
 ],
 "timezone": "Pacific/Auckland",
 "verdict": {
  "advice": "Mon 5-8am, gentle cross-offshore NW 8 kn, 0.1 m sea @ 6 s, rising tide, high 7:54am, dawn - try snapper: soft-baits or berleyed baits along reef edges and work-ups. Also good: Wed 28 Oct.",
  "best_later": {
   "advice": "Sun 6-9pm, light cross-offshore NW 5 kn, 0.1 m sea @ 7 s, falling tide, low 6:59pm, dusk - try snapper: soft-baits or berleyed baits along reef edges and work-ups",
   "confidence": "low",
   "date": "2026-11-01",
   "end": "2026-11-01T21:00:00+13:00",
   "headline": "Sun 6-9pm looks great",
   "rating": "great",
   "score": 8.4,
   "start": "2026-11-01T18:00:00+13:00"
  },
  "confidence": "high",
  "headline": "Go Monday early morning",
  "horizon_days": 3,
  "horizon_end": "2026-10-28",
  "least_bad": null,
  "no_window_reason": null,
  "rating": "great",
  "score": 8.2,
  "window": {
   "end": "2026-10-26T08:00:00+13:00",
   "start": "2026-10-26T05:00:00+13:00"
  }
 },
 "warnings": [
  "Sea temperature is the Open-Meteo marine model (all-hours mean; it includes daytime warming). Against NOAA Coral Reef Watch 5 km night-only satellite SST on 22-23 Oct 2026 it was within about +/-1.2 C at all 21 coastal spots, with no net bias at night (docs/SST_CHECK.md)."
 ],
 "windows": [
  {
   "advice": "Mon 5-8am, gentle cross-offshore NW 8 kn, 0.1 m sea @ 6 s, rising tide, high 7:54am, dawn - try snapper: soft-baits or berleyed baits along reef edges and work-ups",
   "confidence": "high",
   "confidence_detail": {
    "agreement": "fair",
    "downgrades": [],
    "gap_hours": 0,
    "lead_days": 0,
    "lead_level": "high",
    "level": "high",
    "model_scores": {
     "waves:ecmwf_wam": 8.2,
     "waves:meteofrance_wave": 8.2,
     "waves:ncep_gfswave025": 8.2,
     "wind:ecmwf_ifs025": 8.2,
     "wind:gfs_seamless": 8.4,
     "wind:icon_seamless": 9.2
    },
    "models_missing": [],
    "score_best_match": 8.2,
    "score_spread": 1.0
   },
   "date": "2026-10-26",
   "end": "2026-10-26T08:00:00+13:00",
   "gust_max_kn": 12.1,
   "headline": "Mon 5-8am looks great",
   "rain_mm": 0,
   "rating": "great",
   "reasons": [
    "Wind NW 8 kn (cross-offshore)",
    "Gusts to 12 kn"
   ],
   "score": 8.2,
   "start": "2026-10-26T05:00:00+13:00",
   "swell_m": 0.1,
   "swell_period_s": 6.0,
   "wave_m": 0.1,
   "wind_from": "NW",
   "wind_kn": 8.0,
   "wind_rel": "cross-offshore"
  },
  {
   "advice": "Mon 10am-1pm, gentle cross-shore N 8 kn, 0.2 m sea @ 6 s, falling tide, low 1:58pm - try snapper: soft-baits or berleyed baits along reef edges and work-ups",
   "confidence": "high",
   "confidence_detail": {
    "agreement": "fair",
    "downgrades": [],
    "gap_hours": 0,
    "lead_days": 0,
    "lead_level": "high",
    "level": "high",
    "model_scores": {
     "waves:ecmwf_wam": 7.1,
     "waves:meteofrance_wave": 7.1,
     "waves:ncep_gfswave025": 7.1,
     "wind:ecmwf_ifs025": 6.4,
     "wind:gfs_seamless": 7.2,
     "wind:icon_seamless": 7.8
    },
    "models_missing": [],
    "score_best_match": 7.1,
    "score_spread": 1.4
   },
   "date": "2026-10-26",
   "end": "2026-10-26T13:00:00+13:00",
   "gust_max_kn": 11.5,
   "headline": "Mon 10am-1pm looks good",
   "rain_mm": 0,
   "rating": "good",
   "reasons": [
    "Wind N 8 kn (cross-shore)",
    "Gusts to 12 kn"
   ],
   "score": 7.1,
   "start": "2026-10-26T10:00:00+13:00",
   "swell_m": 0.1,
   "swell_period_s": 6.0,
   "wave_m": 0.2,
   "wind_from": "N",
   "wind_kn": 8.1,
   "wind_rel": "cross-shore"
  }
 ]
}
```

### No-window verdict sample (`bluff`, same run)

```json
{
 "rating": "poor",
 "score": 1.1,
 "headline": "No fishable window in the next 3 days",
 "advice": "No fishable window in the next 3 days: no daylight run of hours scores 4.5 (marginal) or more. Least-bad is Wed 5-8am at 1.1/10 (Wind NW 20 kn (cross-offshore); Gusts to 26 kn; Waves 2.4 m (swell 0.9 m @ 10 s)). Next fishable: Tuesday early morning (great, 7.8).",
 "confidence": "medium",
 "window": null,
 "no_window_reason": "No fishable window in the next 3 days: no daylight run of hours scores 4.5 (marginal) or more. Least-bad is Wed 5-8am at 1.1/10 (Wind NW 20 kn (cross-offshore); Gusts to 26 kn; Waves 2.4 m (swell 0.9 m @ 10 s)).",
 "least_bad": {
  "start": "2026-10-28T05:00:00+13:00",
  "end": "2026-10-28T08:00:00+13:00",
  "date": "2026-10-28",
  "score": 1.1,
  "rating": "poor",
  "headline": "Wed 5-8am is the least-bad option",
  "advice": "No good window. Least-bad: Wed 5-8am, fresh cross-offshore NW 20 kn, 2.4 m sea @ 10 s, falling tide, dawn",
  "confidence": "medium",
  "label": "least-bad (not recommended)"
 },
 "horizon_days": 3,
 "horizon_end": "2026-10-28",
 "best_later": {
  "start": "2026-11-03T05:00:00+13:00",
  "end": "2026-11-03T08:00:00+13:00",
  "date": "2026-11-03",
  "score": 7.8,
  "rating": "great",
  "headline": "Tue 5-8am looks great",
  "advice": "Tue 5-8am, gentle offshore N 9 kn, 0.5 m sea @ 7 s, rising tide, dawn - try blue cod: baits on the bottom off the rocks or over foul ground",
  "confidence": "low"
 }
}
```
