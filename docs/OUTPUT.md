# Engine output = site v1 `SpotForecast` (engine 2.1)

`forecast_spot()` now returns the site's v1 contract directly (`web/docs/forecast-api.md` on branch `site-prototype` of the site repo), so `to_v1()` can become a pass-through. `fishon_engine.contract.validate_v1(fc)` checks the v1 fields and returns a list of problems (empty means valid). The tests run it on real data.

Real samples, regenerated offline from recorded responses with `python tools/make_sample.py`; a test fails if they drift:
- `docs/samples/v1_hauraki_gulf_2026-10-26.json` (LINZ daily port)
- `docs/samples/v1_dunedin_2026-10-26.json` (several windows a day)
- `docs/samples/v1_central_otago_lakes_2026-10-26.json` (freshwater: no tides, null sea fields)
- `docs/samples/cli_2026-10-26.txt` (the same data as CLI text)

## How each Site Builder item is handled

| # | Item | Engine 2.1 |
|---|---|---|
| 1 | packaging | `pyproject.toml`: `pip install -e /path/to/fish-engine`, version from `fishon_engine.__version__` (2.1.0), extras `[sstmap]`, `[test]`, script `fishon-forecast` |
| 2 | SST too warm? | Checked against NOAA satellite SST: real and anomalously warm. See SST_CHECK.md; `warnings[]` carries a note |
| 3 | scores too optimistic | Recalibrated weights. See SCORING.md |
| 4 | gusts 2–2.6× mean | Sea cells and sea weather points. See WEATHER_POINTS.md; `spot.forecast_point` |
| 5 | hourly | `hourly[]`: one row per hour (`hourly_step_h: 1`), 24 per day |
| 6 | windows / verdict | Up to 3 non-overlapping windows per day (`windows[]`, time order). Extra windows must be ≥ 4.5 and within 1.5 of the day's best, and at least 2 h clear of the other windows. Plus top-level `verdict` |
| 7 | tide `kind` | `tides[].type` = `high`/`low` |
| 8 | tide datum | `tide_datum` plus per-event `datum`: `chart_datum` (LINZ) or `msl` (Open-Meteo fallback). `hourly[].tide_m` and `tide_series[]` use the same datum |
| 9 | swell vs wave | `swell_m` = Open-Meteo `swell_wave_height` (swell only); `wave_m` (additive) = `wave_height` (total sea). Scoring uses total sea |
| 10 | model_run, daily aggregates | `model_run` string plus `model_runs{}`; `days[].wind_kn_avg/gust_kn_max/swell_m_avg/rain_mm/sst_c_avg` (+ `wave_m_avg`, `wind_kn_max`) |
| 11 | spot fields | `spot{id,name,region,island,lat,lon,species[],notes,tags[],coastal}` from the engine |
| 12 | species once | Top-level `species[]` for the first day, with `changes[]` for later status changes. No per-day species |

## Field notes

- **Times**: ISO 8601 with the NZ offset (`+13:00` / `+12:00`). `hourly[]` is built from Open-Meteo unixtime, so DST days have 23 or 25 rows.
- **Ratings**: v1 four bands. great ≥ 7.5, good ≥ 6, marginal ≥ 4.5, else poor. A `days[].score` of `null` ("No daylight left today", only for today late at night) gets rating `poor`. Day `summary` text starts with a word that matches the rating (Excellent / Good / Marginal / Poor). Site proposal 3 (five bands) is not adopted: the four v1 bands are kept.
- **Daily aggregates**: wind avg, gust max, swell avg and SST avg are over hours between sunrise and sunset. Rain is the whole-day total.
- **`verdict`**: the best window in the period. A later window with lower confidence must beat a nearer one by its margin (medium 0.5, low 1.0) to win, so a day-7 forecast does not override an almost-as-good day-1. Headline: "Go <Weekday> <part of day>" (great/good), "Best chance: …" (marginal), or "Not worth it this week - stay home or fish sheltered water" (poor). `advice` adds "Also good: <days>". `verdict.window{start,end}` is additive.
- **`confidence`**: lead-time heuristic: high ≤ 2 days, medium ≤ 6, low beyond. Not model spread.
- **`model_run`**: `"ECMWF IFS 2026-10-25T00:00Z (latest run ingested by Open-Meteo best_match)"`. Open-Meteo `best_match` blends models and does not say which run produced a given hour. The engine therefore reports `last_run_initialisation_time` from Open-Meteo's model metadata (`https://api.open-meteo.com/data/<model>/static/meta.json`; marine: `marine-api.open-meteo.com`) for ECMWF IFS, the main global model for NZ in best_match. `model_runs{}` lists ecmwf_ifs, ncep_gfs013, dwd_icon, meteofrance_wave and ecmwf_wam (5 small GETs cached 30 min, shared by `forecast_many`). If metadata is unreachable: `"unavailable (Open-Meteo model metadata not reachable)"`.
- **`sources[]`**: starts with `"Open-Meteo (CC BY 4.0)"`, then the LINZ attribution (CC BY 4.0, not for navigation) when LINZ is used, then `"Tides: <source>"`. "Not for navigation" appears exactly once.
- **Datum**: LINZ predictions are heights above chart datum (approximately lowest astronomical tide) at the named port. The Open-Meteo `sea_level_height_msl` fallback is relative to mean sea level, about 8 km resolution, and approximate in timing (the model's highs and lows were 37.5 min earlier than LINZ at Mātiatia Bay on average, max 51 min, over 26 matched extremes in the 26 Oct sample; `compare_tides=True`). Don't plot the two on one axis without converting.

## Additive (v1.1) fields

`data_status: "engine"`, `engine_version`, `hourly_step_h`, `timezone`, `model_runs`, `tide_source`, `tide_datum`, `tide_series[] {time,height_m}` (30 min), `species[]`, `warnings[]`, `attribution[]`, `cache`, and `tide_comparison` (only with `compare_tides=True`).
- `spot`: `facing_deg`, `facing_note`, `tide_port`, `tide_port_id`, `tide_port_km`, `tide_note`, `forecast_point`, `marine_point`.
- `hourly[]`: `wave_m`, `wind_rel`, `light`, `tide_phase`, `rating`.
- `windows[]`: `confidence`, `date`, `wind_kn`, `gust_max_kn`, `wind_from`, `wind_rel`, `wave_m`, `swell_m`, `swell_period_s`, `rain_mm`.
- `days[]`: `label`, `confidence`, `verdict_text`, `best_window` (window object), `best_window_text`, `windows` (count), `moon`, `wave_m_avg`, `wind_kn_max`, `blocks_3h[]` (kept for the Streamlit app).
- `tides[]`: `datum`, `source`.

Removed vs 2.0: `days[].tides` (use top-level `tides[]`), `days[].species` (use top-level `species[]`), `kind` (now `type`).
