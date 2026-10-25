# Fish On forecast engine v2 (`fishon_engine/`)

A standalone Python package (it only needs `requests`) that the Streamlit app, or a future web backend, can call:

```python
from fishon_engine import forecast_spot, forecast_many
fc = forecast_spot("moeraki", days=7)      # dict, JSON-serialisable (default=str)
fc["days"][1]["best_window"]["text"]
# 'Mon 6-9pm, gentle cross-shore N 8 kn, 1.4 m sea @ 7 s, falling tide, dusk - try blue cod: ...'
```

CLI: `python -m fishon_engine hauraki_gulf kaikoura bluff --days 3 [--blocks] [--json]`
Cache warm-up (cron): `python -m fishon_engine.prefetch`
Tests (offline, no network): `pytest -q`

All times are timezone-aware Pacific/Auckland. Open-Meteo is called with `timeformat=unixtime`, so the DST changeover hours can't be duplicated or dropped.

## What it does

| Feature | How |
|---|---|
| Per-hour, per-3-hour and per-day scores | `scoring.score_hour` (every weight is listed in the module docstring), `blocks_3h`, day score = 0.6 × best window + 0.4 × daylight mean |
| Plain-English best window | Best 3–5 h run from 1 h before sunrise to 1 h after sunset. Past hours today are skipped. Days with nothing above 4/10 say "No good window. Least-bad: …" |
| Wind vs coast | `spots._EXTRA` gives each spot a facing bearing. Wind is classed offshore / cross-offshore / cross-shore / cross-onshore / onshore (`wind.relative_to_coast`) |
| Swell | Wave height bands, plus penalties for long-period surge (≥13 s with ≥1.5 m) and short steep chop (≤6 s with ≥1 m) |
| Tides | LINZ standard-port CSV first, with the Open-Meteo `sea_level_height_msl` model as fallback. Run-in to high tide earns a bonus. `compare_tides=True` reports LINZ vs model timing |
| SST | Open-Meteo Marine `sea_surface_temperature`, a daily mean per spot. It drives the snapper "water still cool" note |
| Seasonal species | `data/species_seasons.json`: every season or closure claim has a source. Anything without a source shows "no seasonal data" and nothing is invented |
| Sun / moon | Sunrise and sunset from Open-Meteo. Moon phase is computed with the stdlib (mean lunation, ±~1 day). Near new or full moon adds +0.3 (tradition only, weak evidence) |
| Caching | SQLite (`$FISHON_CACHE_DB`, default `~/.cache/fishon/cache.sqlite`) shared by all processes on a host. TTLs: forecast 1 h, marine 3 h, LINZ 30 days. Serves stale data if the upstream errors. `prefetch.py` warms it from cron |

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

How to read this: the model's highs and lows came 30–70 min *earlier* than LINZ at every port. The tidal ranges were close. I checked that LINZ CSV times are NZ clock time, including daylight saving: the times jump by one hour at the 5 Apr and 27 Sep 2026 changes. So the gap is not a timezone bug in this engine. It most likely comes from Open-Meteo's ~8 km grid point being offshore of the port. Open-Meteo itself says coastal accuracy is limited and the data is not for navigation. **Decision: LINZ is the primary source. The model is only used where no port is mapped (currently the Catlins) or if LINZ fails, and it is labelled "modelled".** Other caveats:

- LINZ heights are relative to chart datum and the model's are relative to global MSL, so only compare ranges, never absolute heights.
- LINZ predictions are astronomical only, with no storm surge.
- LINZ notes these predictions are not official tide tables under Maritime Rules Part 25.
- Secondary ports (Moeraki, Greymouth, etc.) are currently mapped to a nearby standard port, so times can be out by tens of minutes. The LINZ secondary-port offsets CSV is the next step.

## Data sources, licensing, costs (checked 25 Oct 2026 NZDT)

- **Open-Meteo** (weather and marine). Data is CC BY 4.0, so attribution is required: "Weather data by Open-Meteo.com". The free API is **non-commercial only** (600/min, 5,000/h, 10,000/day, 300,000/month), so a paid public site needs a plan (https://open-meteo.com/en/pricing):
  - API Standard: **€29/month**, 1M calls/month, commercial use, Forecast and Marine included.
  - API Professional: **€99/month**, 5M calls/month.
  - Larger plans start at €160 per 10M calls.
  - Requests with more than 10 variables or longer than 2 weeks count as more than one call. This engine keeps each request to 9 (forecast) or 7 (marine) variables and at most 14 days.
  - Set `OPEN_METEO_API_KEY` and the engine switches to `customer-api.open-meteo.com` and `customer-marine-api.open-meteo.com` (both answer "API key required" without a key).
  - Rough volume: 23 spots refreshed hourly is about 23 × 2 × 24 × 30 ≈ 33k calls/month, about 3% of Standard.
- **LINZ tide predictions**: CC BY 4.0. Attribution: "Contains data sourced from Land Information New Zealand (LINZ), licensed for reuse under CC BY 4.0". https://www.linz.govt.nz/products-services/tides-and-tidal-streams/tide-predictions, https://www.linz.govt.nz/copyright
- **Species/rules**: MPI Challenger rules (Marlborough Sounds blue cod closed 1 Sep – 10 Jan), Parsons et al. 2014 and NIWA (snapper), Fisheries NZ FAR 2025/52 (West Coast southern bluefin tuna), Fish & Game Otago (lakes open all year). Links are in `data/species_seasons.json`. Rules change, so link users to MPI's NZ Fishing Rules app rather than presenting our data as the rule.

## SST map (implemented: `fishon_engine/sstmap.py`, see docs/SST_MAP.md)

One POST to the Open-Meteo Marine API returns `current=sea_surface_temperature` for a 0.5° grid of 663 sea cells. It is cached for 6 h in the shared SQLite cache. The outputs are a PNG with a legend and a coastline, a GeoJSON, and plain-English notes about fronts, warm edges and isotherms. `python -m fishon_engine.sstmap --out docs/sst`.

## Known limitations and open questions

- Each "spot" is still a broad region with one coordinate, and the facing bearings are first-pass estimates (see `spots._EXTRA`). These need local knowledge, and ideally the regions should be split into real marks.
- The score is a heuristic with hand-set weights. Logging users' catch reports would let us calibrate it.
- "Confidence" (high ≤2 days, medium ≤6, low beyond) is a lead-time heuristic, not model spread.
- Freshwater (lakes) scoring uses only wind, rain, pressure and light.
- `prefetch` is sequential (~78 s for 23 spots on the first run, mostly LINZ downloads that are then cached for 30 days).
- The Streamlit `app.py` is not wired to the engine yet. That is the next PR.
