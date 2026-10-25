# Fish On forecast engine 2.2 (`fishon_engine/`)

A standalone Python package (it only needs `requests`) that the Streamlit app, or a future web backend, can call. Install it with `pip install -e /path/to/fish-engine` (add `[sstmap]` for the SST map, `[test]` for pytest). Its output is the site's **v1 `SpotForecast`** contract; see **docs/OUTPUT.md**.

```python
from fishon_engine import forecast_spot, forecast_many
from fishon_engine.contract import validate_v1
fc = forecast_spot("hauraki_gulf", days=7)  # dict, JSON-serialisable
assert validate_v1(fc) == []
fc["verdict"]["headline"]       # 'Go Monday early morning'  (docs/samples/v1_hauraki_gulf_2026-10-26.json)
fc["windows"][0]["advice"]      # 'Mon 5–8am, gentle cross-offshore NW 8 kn, 0.1 m sea @ 3 s, rising tide, ...'
```

CLI: `python -m fishon_engine hauraki_gulf kaikoura bluff --days 3 [--hourly] [--json]` (or `fishon-forecast …` once installed). Example: docs/samples/cli_2026-10-26.txt.

More docs: OUTPUT.md (v1 fields), SCORING.md (2.1 weights and calibration), WEATHER_POINTS.md (gust ratio fix, weather points), MARINE_POINTS.md (marine sample points), CONFIDENCE.md (model agreement), SST_CHECK.md (SST vs NOAA satellite), TIDE_PORTS.md, SST_MAP.md.
Cache warm-up (cron): `python -m fishon_engine.prefetch`
Tests (offline, no network): `pytest -q`

All times are timezone-aware Pacific/Auckland. Open-Meteo is called with `timeformat=unixtime`, so the DST changeover hours can't be duplicated or dropped.

## What it does

| Feature | How |
|---|---|
| Per-hour and per-day scores | `scoring.score_hour` (2.1 weights in the module docstring and docs/SCORING.md), `hourly[]` every hour, day score = 0.6 × best window + 0.4 × daylight mean, v1 ratings (great ≥7.5, good ≥6, marginal ≥4.5) |
| Plain-English windows and verdict | Every separate 3–5 h window scoring ≥4.5 per day (the best is always picked first), from 1 h before sunrise to 1 h after sunset, at least 2 h apart, touching runs merged; `near_best` flags those within 1.5 of the best. Past hours today are skipped; `days[].score_remaining` / `score_full_day` say which hours today's score covers. A headline `verdict` from the next 3 days (`best_later` for after that). Days, or a horizon, with no window ≥4.5 get a null window, a `no_window_reason`, and a separately labelled least-bad window |
| Weather point | Open-Meteo forecast with `cell_selection=sea` for coastal spots, at a sea `forecast_point` where the display coordinate's cell is land (docs/WEATHER_POINTS.md). Lakes use `land` |
| Wind vs coast | `spots._EXTRA` gives each spot a facing bearing. Wind is classed offshore / cross-offshore / cross-shore / cross-onshore / onshore (`wind.relative_to_coast`) |
| Swell | Wave height bands, plus penalties for long-period surge (≥13 s with ≥1.5 m) and short steep chop (≤6 s with ≥1 m) |
| Tides | Nearest suitable LINZ port (87 daily-prediction sites + LINZ secondary ports with offsets; see docs/TIDE_PORTS.md) first, with the Open-Meteo `sea_level_height_msl` model as fallback. Run-in to high tide earns a bonus. `compare_tides=True` reports LINZ vs model timing |
| Marine point | Each coastal spot reads waves/swell/SST at a checked at-sea 1/12° cell (`spots.MARINE_POINTS`, docs/MARINE_POINTS.md) |
| Confidence | Lead time, lowered when ECMWF/GFS/ICON wind or MFWAM/ECMWF-WAM/GFS-Wave seas disagree on the window score, or data is missing (docs/CONFIDENCE.md) |
| SST | Open-Meteo Marine `sea_surface_temperature`, a daily mean over all hours per spot, not bias-corrected (docs/SST_CHECK.md). It drives the snapper "water still cool" note |
| Seasonal species | `data/species_seasons.json`: every season or closure claim has a source. Anything without a source shows "no seasonal data" and nothing is invented |
| Sun / moon | Sunrise and sunset from Open-Meteo. Moon phase is computed with the stdlib (mean lunation, ±~1 day). Near new or full moon adds +0.25 (tradition only, weak evidence) |
| Caching | SQLite (`$FISHON_CACHE_DB`, default `~/.cache/fishon/cache.sqlite`) shared by all processes on a host. TTLs: forecast 1 h, marine 3 h, model comparison 3 h, model-run metadata 30 min, SST map 12 h, LINZ 30 days. Serves stale data if the upstream errors. `prefetch.py` warms it from cron |

## Tides: LINZ vs Open-Meteo (measured 25 Oct 2026 NZDT, next 3 days)

Matched highs and lows (model minus LINZ):

| Spot (LINZ port) | mean offset | max offset | LINZ range | model range |
|---|---|---|---|---|
| Hauraki Gulf (Auckland) | −41.9 min | 51.4 min | 2.9 m | 2.51 m |
| Wellington | −40.7 | 51.9 | 1.0 | 1.04 |
| Nelson | −30.1 | 39.5 | 3.8 | 3.74 |
| Tauranga | −52.7 | 58.0 | 1.7 | 1.79 |
| Port Taranaki | −29.6 | 32.4 | 3.3 | 3.51 |
| Kaikōura | −28.5 | 35.3 | 1.5 | 1.67 |
| Bluff | −68.5 | 73.2 | 2.3 | 2.38 |
| Moeraki (Oamaru) | −61.6 | 71.5 | 1.7 | 1.92 |

How to read this: the model's highs and lows came 30–70 min *earlier* than LINZ at every port. The tidal ranges were close. I checked that LINZ CSV times are NZ clock time, including daylight saving: the times jump by one hour at the 5 Apr and 27 Sep 2026 changes. So the gap is not a timezone bug in this engine. It most likely comes from Open-Meteo's ~8 km grid point being offshore of the port. Open-Meteo itself says coastal accuracy is limited and the data is not for navigation. **Decision: LINZ is the primary source. The model is only used if LINZ fails (since PR B every coastal spot has a LINZ port), and it is labelled "modelled".** Other caveats:

- LINZ heights are relative to chart datum and the model's are relative to global MSL, so only compare ranges, never absolute heights.
- LINZ predictions are astronomical only, with no storm surge.
- LINZ notes these predictions are not official tide tables under Maritime Rules Part 25.
- Secondary ports (Moeraki, Greymouth, etc.) now use LINZ's published time/height offsets from their standard port; see docs/TIDE_PORTS.md for the method and a validation against LINZ daily predictions.

## Data sources, licensing, costs (checked 25 Oct 2026 NZDT)

- **Open-Meteo** (weather and marine). Data is CC BY 4.0, so attribution is required: "Weather data by Open-Meteo.com". The free API is **non-commercial only** (600/min, 5,000/h, 10,000/day, 300,000/month), so a paid public site needs a plan (https://open-meteo.com/en/pricing):
  - API Standard: **€29/month**, 1M calls/month, commercial use, Forecast and Marine included.
  - API Professional: **€99/month**, 5M calls/month.
  - Larger plans start at €160 per 10M calls.
  - Requests with more than 10 variables or longer than 2 weeks count as more than one call. This engine keeps each request to 9 (forecast) or 7 (marine) variables and at most 14 days.
  - Set `OPEN_METEO_API_KEY` and the engine switches to `customer-api.open-meteo.com` and `customer-marine-api.open-meteo.com` (both answer "API key required" without a key).
  - Call volume if everything is kept warm (TTL-limited; per day, 30-day month in brackets). Whether metadata GETs count isn't documented; this assumes they do. The comparison requests ask for 3 models × 3 variables (wind) and 3 × 1 (waves); Open-Meteo's pricing calculator multiplies by models, which still stays ≤ 10 variables, so each is assumed to be 1 call.

    | Source | 2.1 (PR C) | 2.2 (PR D) |
    |---|---|---|
    | Forecast, 23 spots, 1 h TTL | 552 | 552 |
    | Marine, 21 coastal spots, 3 h TTL | 168 | 168 |
    | Model comparison: wind 23 spots + waves 21 spots, 3 h TTL | – | 352 |
    | Model-run metadata, 5 GETs, 30 min TTL | 240 | 240 |
    | SST map | 663 × 4 = 2,652 (6 h) | 469 × 2 = 938 (12 h) |
    | **Total/day** | **3,612 (~108k/month)** | **2,250 (~67.5k/month)** |

    Per SST refresh: 663 → 469 calls (−29%). 2.2 total is ~6.8% of Standard and within the free tier's 10k/day (non-commercial only).
- **LINZ tide predictions**: CC BY 4.0. Attribution: "Contains data sourced from Land Information New Zealand (LINZ), licensed for reuse under CC BY 4.0". https://www.linz.govt.nz/products-services/tides-and-tidal-streams/tide-predictions, https://www.linz.govt.nz/copyright
- **Species/rules**: MPI Challenger rules (Marlborough Sounds blue cod closed 1 Sep – 10 Jan), Parsons et al. 2014 and NIWA (snapper), Fisheries NZ FAR 2025/52 (West Coast southern bluefin tuna), Fish & Game Otago (lakes open all year), Fish & Game Southland 2026-27 regulations (Te Anau/Manapouri open all year), Holdsworth et al. FAR 2013/3 (kingfish mainly in summer in Cook Strait and East Cape–Hawke Bay), Ministry of Fisheries 2008 TOR plenary (Pacific bluefin, west coast South Island Aug–Sep), Ministry of Fisheries 2009 albacore supporting information (recreational albacore Nov–May, peak Feb–Mar). Tuna species at Kaikōura, Far North and Greymouth (southern and Pacific bluefin main, albacore secondary): local knowledge, Alex Le Brun, 26 Oct 2026. Links are in `data/species_seasons.json`. Rules change, so link users to MPI's NZ Fishing Rules app rather than presenting our data as the rule.

## SST map (implemented: `fishon_engine/sstmap.py`, see docs/SST_MAP.md)

One POST to the Open-Meteo Marine API returns SST for 469 coastal points (0.5° cells within 150 km of the coast plus 0.25° points within 25 km). It is cached for 12 h in the shared SQLite cache (2.1: 663 cells every 6 h). The outputs are a PNG with a legend and a coastline, a GeoJSON, and plain-English notes about fronts, warm edges and isotherms. `python -m fishon_engine.sstmap --out docs/sst`.

## Known limitations and open questions

- Each "spot" is still a broad region with one coordinate, and the facing bearings are first-pass estimates (see `spots._EXTRA`). These need local knowledge, and ideally the regions should be split into real marks.
- The score is a heuristic with hand-set weights, re-tuned in 2.1 against one real week (docs/SCORING.md). Logging users' catch reports would let us calibrate it properly.
- Sea-cell weather points give higher mean winds than the old land cells (docs/WEATHER_POINTS.md). That is more realistic for boats, but harsher for shore anglers in a sheltered bay.
- Confidence uses three wind and three wave models, not a calibrated ensemble (docs/CONFIDENCE.md). ICON runs ~7 days, so day 7+ has two wind models.
- Marlborough Sounds' marine cell is in Cook Strait, 26 km away; Stewart Island 17 km; Bay of Islands 16 km (docs/MARINE_POINTS.md).
- Freshwater (lakes) scoring uses only wind, rain, pressure and light.
- `prefetch` is sequential (~78 s for 23 spots on the first run, mostly LINZ downloads that are then cached for 30 days).
- The Streamlit `app.py` is not wired to the engine yet. That is the next PR.
