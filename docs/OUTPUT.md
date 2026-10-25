# Engine output = site v1 `SpotForecast` (engine 2.2)

`forecast_spot()` now returns the site's v1 contract directly (`web/docs/forecast-api.md` on branch `site-prototype` of the site repo), so `to_v1()` can become a pass-through. `fishon_engine.contract.validate_v1(fc)` checks the v1 fields and returns a list of problems (empty means valid). The tests run it on real data.

Real samples, regenerated offline from recorded responses with `python tools/make_sample.py`; a test fails if they drift:
- `docs/samples/v1_hauraki_gulf_2026-10-26.json` (LINZ daily port)
- `docs/samples/v1_dunedin_2026-10-26.json` (several windows a day)
- `docs/samples/v1_central_otago_lakes_2026-10-26.json` (freshwater: no tides, null sea fields)
- `docs/samples/cli_2026-10-26.txt` (the same data as CLI text)
- `docs/samples/v1_bay_of_islands_2026-10-26_0848.json` (Bay of Islands, recorded and replayed at 08:48 NZDT on 26 Oct, so today's early hours have gone: shows `score_remaining` / `score_full_day` and three windows on the day)

## How each Site Builder item is handled

| # | Item | Engine 2.1 / 2.2 |
|---|---|---|
| 1 | packaging | `pyproject.toml`: `pip install -e /path/to/fish-engine`, version from `fishon_engine.__version__` (2.2.0), extras `[sstmap]`, `[test]`, script `fishon-forecast` |
| 2 | SST too warm? | Checked against NOAA satellite SST: real and anomalously warm. See SST_CHECK.md; `warnings[]` carries a note |
| 3 | scores too optimistic | Recalibrated weights. See SCORING.md |
| 4 | gusts 2–2.6× mean | Sea cells and sea weather points. See WEATHER_POINTS.md; `spot.forecast_point` |
| 5 | hourly | `hourly[]`: one row per hour (`hourly_step_h: 1`), 24 per day |
| 6 | windows / verdict | Every separate window that scores ≥ 4.5 (`windows[]`, time order, no cap). Windows are at least 2 h apart; touching or overlapping runs are merged. `near_best` flags those within 1.5 of the day's best. Plus top-level `verdict` |
| 7 | tide `kind` | `tides[].type` = `high`/`low` |
| 8 | tide datum | `tide_datum` plus per-event `datum`: `chart_datum` (LINZ) or `msl` (Open-Meteo fallback). `hourly[].tide_m` and `tide_series[]` use the same datum |
| 9 | swell vs wave | `swell_m` = Open-Meteo `swell_wave_height` (swell only); `wave_m` (additive) = `wave_height` (total sea). Scoring uses total sea |
| 10 | model_run, daily aggregates | `model_run` string plus `model_runs{}`; `days[].wind_kn_avg/gust_kn_max/swell_m_avg/rain_mm/sst_c_avg` (+ `wave_m_avg`, `wind_kn_max`) |
| 11 | spot fields | `spot{id,name,region,island,lat,lon,species[],notes,tags[],coastal}` from the engine |
| 12 | species once | Top-level `species[]` for the first day, with `changes[]` for later status changes. No per-day species |

## Field notes

- **Times**: ISO 8601 with the NZ offset (`+13:00` / `+12:00`). `hourly[]` is built from Open-Meteo unixtime, so DST days have 23 or 25 rows.
- **Ratings**: v1 four bands. great ≥ 7.5, good ≥ 6, marginal ≥ 4.5, else poor. A `days[].score` of `null` ("No daylight left today", only for today late at night) gets rating `poor`. Day `summary` text starts with a word that matches the rating (Excellent / Good / Marginal / Poor). Site proposal 3 (five bands) is not adopted: the four v1 bands are kept.
- **Daily aggregates** (2.2): `gust_kn_max` and `wind_kn_max` are over **every hour of the date**, so they are never below any `hourly[]` row (2.1 used daylight hours only, so e.g. Hauraki Sun 1 Nov showed 17.5 kn while the hourly rows reached 20.2). The daylight-only maxima are in additive `gust_kn_max_daylight` / `wind_kn_max_daylight`. Wind avg, swell avg and wave avg are over sunrise–sunset hours. `sst_c_avg` is the mean over all hours (2.1 already did this; this page wrongly said daylight). Rain is the whole-day total.
- **`verdict`** (2.2): picks from fishable windows (rating marginal or better) in the **next 3 days only** (`verdict.horizon_days`, `verdict.horizon_end`, additive), not the whole period. Within those days a later window with lower confidence must still beat a nearer one by its margin (medium 0.5, low 1.0). Headline: "Go <Weekday> <part of day>" (great/good) or "Best chance: …" (marginal). `advice` adds "Also good: <days>" (within the horizon). The best fishable window after the horizon is in additive `verdict.best_later` (`start,end,date,score,rating,headline,advice,confidence`) or null.
- **No fishable window** (2.2): if nothing in the horizon rates marginal or better, `verdict.window` is **null**, `rating` is `poor`, the headline is "No fishable window in the next 3 days", and `verdict.no_window_reason` says why (e.g. "No fishable window in the next 3 days: no daylight run of hours scores 4.5 (marginal) or more. Least-bad is <window> at <score>/10 (<reasons>)"). The least-bad option is only in `verdict.least_bad`, labelled `"least-bad (not recommended)"`; `advice` also names the next fishable window if there is one later. `verdict.score` is the least-bad score (0 if none). The same applies per day: `days[].best_window` is null on a day with no fishable window, `days[].no_window_reason` explains, and `days[].least_bad_window` (additive) holds the labelled least-bad. Top-level `windows[]` lists only fishable windows (2.1 also listed a poor least-bad window per day), and `days[].windows` counts them.
- **`confidence`** (2.2): lead time, lowered by model disagreement and data gaps; see docs/CONFIDENCE.md. Same `high/medium/low` enum. Detail in additive `windows[].confidence_detail`; `days[].lead_confidence` keeps the lead-only value.
- **`model_run`**: `"ECMWF IFS 2026-10-25T00:00Z (latest run ingested by Open-Meteo best_match)"`. Open-Meteo `best_match` blends models and does not say which run produced a given hour. The engine therefore reports `last_run_initialisation_time` from Open-Meteo's model metadata (`https://api.open-meteo.com/data/<model>/static/meta.json`; marine: `marine-api.open-meteo.com`) for ECMWF IFS, the main global model for NZ in best_match. `model_runs{}` lists ecmwf_ifs, ncep_gfs013, dwd_icon, meteofrance_wave and ecmwf_wam (5 small GETs cached 30 min, shared by `forecast_many`). If metadata is unreachable: `"unavailable (Open-Meteo model metadata not reachable)"`.
- **`sources[]`**: starts with `"Open-Meteo (CC BY 4.0)"`, then the LINZ attribution (CC BY 4.0, not for navigation) when LINZ is used, then `"Tides: <source>"`. "Not for navigation" appears exactly once.
- **Datum**: LINZ predictions are heights above chart datum (approximately lowest astronomical tide) at the named port. The Open-Meteo `sea_level_height_msl` fallback is relative to mean sea level, about 8 km resolution, and approximate in timing (the model's highs and lows were 37.5 min earlier than LINZ at Mātiatia Bay on average, max 51 min, over 26 matched extremes in the 26 Oct sample; `compare_tides=True`). Don't plot the two on one axis without converting.

## Additive (v1.1) fields

`data_status: "engine"`, `engine_version`, `hourly_step_h`, `timezone`, `model_runs`, `tide_source`, `tide_datum`, `tide_series[] {time,height_m}` (30 min), `species[]`, `warnings[]`, `attribution[]`, `cache`, and `tide_comparison` (only with `compare_tides=True`).
- `spot`: `facing_deg`, `facing_note`, `tide_port`, `tide_port_id`, `tide_port_km`, `tide_note`, `forecast_point`, `marine_point` (2.2: `marine_point.note` when the marine cell is far from the spot; docs/MARINE_POINTS.md).
- `verdict` (2.2): `no_window_reason`, `least_bad`, `best_later`, `horizon_days`, `horizon_end`.
- `hourly[]`: `wave_m`, `wind_rel`, `light`, `tide_phase`, `rating`.
- `windows[]`: `confidence`, `confidence_detail` (2.2), `date`, `wind_kn`, `gust_max_kn`, `wind_from`, `wind_rel`, `wave_m`, `swell_m`, `swell_period_s`, `rain_mm`.
- `days[]`: `label`, `confidence`, `verdict_text`, `best_window` (window object), `best_window_text`, `windows` (count), `moon`, `wave_m_avg`, `wind_kn_max`, `blocks_3h[]`; 2.2: `gust_kn_max_daylight`, `wind_kn_max_daylight`, `no_window_reason`, `least_bad_window`, `lead_confidence` (kept for the Streamlit app).
- `tides[]`: `datum`, `source`.

Removed vs 2.0: `days[].tides` (use top-level `tides[]`), `days[].species` (use top-level `species[]`), `kind` (now `type`).

## Changes in 2.2 that affect existing v1 fields (all still valid v1)

- `verdict` looks at the next 3 days, not the whole period, and `verdict.window` is null when nothing is fishable (it was the least-bad window before). `verdict.window` was already nullable in v1.
- `days[].best_window` is null on days with no fishable window (it held the least-bad window).
- `windows[]` contains only fishable windows.
- `days[].gust_kn_max` / `wind_kn_max` are over all hours (were daylight).
- `confidence` values can be lower than lead time alone would give.
- `warnings[]` SST note reworded (docs/SST_CHECK.md).
- Species: kingfish at Wellington, East Cape and Hawke's Bay, and trout/salmon at the Southern Lakes, now have sourced seasons.
- Species names: the generic "Tuna" (Kaikōura) and "Tuna (seasonal)" (Far North, Greymouth) are replaced by **Southern Bluefin Tuna** and **Pacific Bluefin Tuna** (main) and **Albacore** (secondary), per local knowledge from Alex Le Brun, 26 Oct 2026. `spot.species[]` for those three spots changes accordingly. Seasons: albacore Nov–May, peak Feb–Mar at all three (MFish 2009, NZBGFC club records); Pacific bluefin Aug–Sep at Greymouth (2008 TOR plenary); southern bluefin keeps the existing west-coast Jan–Aug at Greymouth; SBT at Kaikōura / Far North and PBF at Kaikōura / Far North say "no seasonal data". 97 of 124 spot–species pairs now say "no seasonal data".
- `species[]` items gain additive `role` (`"main"` or `"secondary"`) and `species_source` (why the species is listed at this spot, e.g. `"local knowledge: Alex Le Brun, 26 Oct 2026"`; null when it comes from the original spot list). Secondary species sort after main species with the same status, and the verdict's target species is a main species whenever one is open.

## Windows, today's score and copy (feat/windows-and-copy)

All additive; `validate_v1` still passes.

**Windows.** `windows[]` (and `days[].windows`, the count) now holds every separate window of the day scoring ≥ 4.5, not just those within 1.5 of the day's best, and there is no longer a cap of 3 a day. A window is a 3 to 5 h daylight run. The first pick is the day's best; each further pick is the best run left that is at least 2 h clear of the windows already picked; touching or overlapping runs are merged into one. In practice a day fits at most 4.

| field | type | meaning |
|---|---|---|
| `windows[].near_best` | bool | `score >= (day's best window score - 1.5)`, rounded to 1 dp. Always true for the day's best. Also on `days[].best_window` and `days[].least_bad_window` |
| `days[].score_remaining` | float \| null | Today only: the day score over the daylight hours not yet past at `generated_at` (best remaining window x 0.6 + mean remaining daylight hour x 0.4). Null on other days, and when no daylight is left |
| `days[].remaining_from` | string \| null | Today only: ISO start of the first hour counted in `score_remaining` (the current hour) |
| `days[].score_full_day` | float \| null | The same formula over every daylight hour of the date, gone or not. Equals `score` on days other than today |

**Which score to show.** `days[].score` is unchanged: for today it was already computed over the hours left at `generated_at`, so it equals `score_remaining`. Show `score_remaining` for today (it says what it is, and `remaining_from` lets you tell when cached output has gone stale: if the current hour is later than `remaining_from`, regenerate or label the score with that time). Show `score` for every other day. `score_full_day` is for "how was today overall"; don't show it as today's outlook.

The headline and verdict are unchanged: the verdict still picks the best fishable window (with the confidence margin), so the extra lower windows can't change it. "Also good" still lists other days.

Bay of Islands, 26 Oct (from `docs/samples/v1_bay_of_islands_2026-10-26_0848.json`, `generated_at` 08:48 NZDT):

```json
"days": [{"date": "2026-10-26", "score": 7.0, "score_remaining": 7.0,
          "remaining_from": "2026-10-26T08:00:00+13:00", "score_full_day": 8.0, "windows": 3, "...": "..."},
         {"date": "2026-10-27", "score": 6.1, "score_remaining": null,
          "remaining_from": null, "score_full_day": 6.1, "...": "..."}],
"windows": [
  {"start": "2026-10-26T08:00:00+13:00", "end": "2026-10-26T11:00:00+13:00", "score": 7.6, "rating": "great",
   "headline": "Mon 8-11am looks great", "near_best": true, "...": "..."},
  {"start": "2026-10-26T13:00:00+13:00", "end": "2026-10-26T16:00:00+13:00", "score": 5.2, "rating": "marginal",
   "headline": "Mon 1-4pm is fishable", "near_best": false, "...": "..."},
  {"start": "2026-10-26T18:00:00+13:00", "end": "2026-10-26T21:00:00+13:00", "score": 6.4, "rating": "good",
   "headline": "Mon 6-9pm looks good", "near_best": true, "...": "..."}]
```

Replayed with the clock at 00:54 (whole day) the same data gives 5-8am 8.8 (near_best), 10am-1pm 6.6 and 6-9pm 6.4 (both not near_best); before this change only 5-8am was listed.

**Copy.** Generated text has no em dashes, no spaced en dashes and no spaced hyphens used as dashes (a test checks every string in the samples and the CLI text; LINZ port names such as "Lottin Point - Wakatiri" are left as LINZ spells them). Changed wording:

| before | after |
|---|---|
| `Excellent - go fishing` | `Excellent, go fishing` |
| `Marginal - pick your window` | `Marginal, pick your window` |
| `Poor - stay home / sheltered water only` | `Poor, stay home or stick to sheltered water` |
| `..., dawn - try snapper: soft-baits ...` | `..., dawn. Try snapper: soft-baits ...` |
| `Lake – wind direction vs shore not scored` (`spot.facing_note`) | `Lake, so wind direction against the shore isn't scored` |
| `Many rivers close 30 Apr - check the Otago Fish & Game regulations.` | `Many rivers close 30 Apr, so check the Otago Fish & Game regulations.` |
| `closed 1 Sep - 10 Jan inclusive` / `open 1 Nov - 31 May only` | `closed 1 Sep to 10 Jan inclusive` / `open 1 Nov to 31 May only` |
| SST notes: `# SST notes — valid ...`, `9.1–12.8 °C` | `# SST notes, valid ...`, `9.1 to 12.8 °C` |
| CLI: `VERDICT: Go Monday early morning - great 8.2/10 [high]` | `VERDICT: Go Monday early morning (great, 8.2/10) [high]` |

The day `summary` still starts with the rating word, so it now reads e.g. "Excellent, go fishing. Gentle winds all day (~10 kn); 0.3 m sea. Best: Mon 5-8am."

**Brand.** Salt Supply Co (was Fish On): HTTP User-Agent `SaltSupplyCo-engine/2.0 (+https://github.com/lebrun76-lab/FIsh-on-3)`, the pyproject description, README title and the Streamlit app's titles. The package (`fishon_engine`, `fishon-engine`), the CLI script name (`fishon-forecast`) and the cache path (`~/.cache/fishon`) are unchanged.
