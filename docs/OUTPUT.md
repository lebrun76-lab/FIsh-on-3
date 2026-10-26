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
| 1 | packaging | `pyproject.toml`: `pip install -e /path/to/fish-engine`, version from `fishon_engine.__version__` (2.5.0), extras `[sstmap]`, `[test]`, script `fishon-forecast` |
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
- **`verdict`** (2.2): picks from fishable windows (rating marginal or better) in the **next 3 days only** (`verdict.horizon_days`, `verdict.horizon_end`, additive), not the whole period. Within those days a later window with lower confidence must still beat a nearer one by its margin (medium 0.5, low 1.0). Headline: "Go <Weekday> <part of day>" (great/good) or "Best chance: …" (marginal). `advice` adds "Also good: <days>" (within the horizon). The best fishable window after the horizon is in additive `verdict.best_later` (`id,start,end,date,score,rating,headline,advice,confidence`) or null.
- **No fishable window** (2.2): if nothing in the horizon rates marginal or better, `verdict.window` is **null**, `rating` is `poor`, the headline is "No fishable window in the next 3 days", and `verdict.no_window_reason` says why (e.g. "No fishable window in the next 3 days: no daylight run of hours scores 4.5 (marginal) or more. Least-bad is <window> at <score>/10 (<reasons>)"). The least-bad option is only in `verdict.least_bad`, labelled `"least-bad (not recommended)"`; `advice` also names the next fishable window if there is one later. `verdict.score` is the least-bad score (0 if none). The same applies per day: `days[].best_window` is null on a day with no fishable window, `days[].no_window_reason` explains, and `days[].least_bad_window` (additive) holds the labelled least-bad. Top-level `windows[]` lists only fishable windows (2.1 also listed a poor least-bad window per day), and `days[].windows` counts them.
- **`confidence`** (2.2): lead time, lowered by model disagreement and data gaps; see docs/CONFIDENCE.md. Same `high/medium/low` enum. Detail in additive `windows[].confidence_detail`; `days[].lead_confidence` keeps the lead-only value.
- **`model_run`**: `"ECMWF IFS 2026-10-25T00:00Z (latest run ingested by Open-Meteo best_match)"`. Open-Meteo `best_match` blends models and does not say which run produced a given hour. The engine therefore reports `last_run_initialisation_time` from Open-Meteo's model metadata (`https://api.open-meteo.com/data/<model>/static/meta.json`; marine: `marine-api.open-meteo.com`) for ECMWF IFS, the main global model for NZ in best_match. `model_runs{}` lists ecmwf_ifs, ncep_gfs013, dwd_icon, meteofrance_wave and ecmwf_wam (5 small GETs cached 30 min, shared by `forecast_many`). If metadata is unreachable: `"unavailable (Open-Meteo model metadata not reachable)"`.
- **`sources[]`**: starts with `"Open-Meteo (CC BY 4.0)"`, then the LINZ attribution (CC BY 4.0, not for navigation) when LINZ is used, then `"Tides: <source>"`. "Not for navigation" appears exactly once.
- **Datum**: LINZ predictions are heights above chart datum (approximately lowest astronomical tide) at the named port. The Open-Meteo `sea_level_height_msl` fallback is relative to mean sea level, about 8 km resolution, and approximate in timing (the model's highs and lows were 37.5 min earlier than LINZ at Mātiatia Bay on average, max 51 min, over 26 matched extremes in the 26 Oct sample; `compare_tides=True`). Don't plot the two on one axis without converting.

## Additive (v1.1) fields

`data_status: "engine"`, `engine_version`, `hourly_step_h`, `timezone`, `model_runs`, `tide_source`, `tide_datum`, `tide_series[] {time,height_m}` (30 min), `species[]`, `warnings[]`, `attribution[]`, `cache`, and `tide_comparison` (only with `compare_tides=True`).
- `spot`: `facing_deg`, `facing_note`, `tide_port`, `tide_port_id`, `tide_port_km`, `tide_port_linz_name` (2.3), `tide_note`, `forecast_point`, `marine_point` (2.2: `marine_point.note` when the marine cell is far from the spot; docs/MARINE_POINTS.md).
- `verdict` (2.2): `no_window_reason`, `least_bad`, `best_later`, `horizon_days`, `horizon_end`.
- `hourly[]`: `wave_m`, `wind_rel`, `light`, `tide_phase`, `rating`.
- `windows[]`: `id` and `target_species` (2.4.0, see Window ids), `confidence`, `confidence_detail` (2.2), `date`, `wind_kn`, `gust_max_kn`, `wind_from`, `wind_rel`, `wave_m`, `swell_m`, `swell_period_s`, `rain_mm`. `species` (2.5.0, see Species scoring).
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
| `valid_until` | string | Top level, 2.3. ISO time (NZ offset) at the end of the hour `generated_at` falls in, i.e. `remaining_from` + 1 h. See below |
| `days[].score_full_day` | float \| null | The same formula over every daylight hour of the date, gone or not. Equals `score` on days other than today |

**Which score to show.** `days[].score` is unchanged: for today it was already computed over the hours left at `generated_at`, so it equals `score_remaining`. Show `score_remaining` for today. Treat the output as current until `valid_until`; after that, regenerate (or label today's score "as of `remaining_from`"). Show `score` for every other day. `score_full_day` is for "how was today overall"; don't show it as today's outlook.

**`valid_until` (2.3).** The engine drops past hours at hour granularity, so today's `score`, `score_remaining`, today's windows and the verdict only change when the clock passes the top of the hour. `valid_until` is that moment: `generated_at` floored to the hour, plus 1 h (08:48 gives `"2026-10-26T09:00:00+13:00"`; 00:54 gives `01:00`). The forecast cache TTL is also 1 h, so a fresh run after `valid_until` may also pick up new forecast data; marine and model-comparison caches live 3 h and LINZ tide tables 30 days, so those can be older than `generated_at`. It is a "recompute after" time, not a guarantee the weather data was refreshed at that point.

**Version.** This section shipped in 2.3.0. The current `engine_version` is given under Window ids below.

The headline and verdict are unchanged: the verdict still picks the best fishable window (with the confidence margin), so the extra lower windows can't change it. "Also good" still lists other days.

Bay of Islands, 26 Oct (from `docs/samples/v1_bay_of_islands_2026-10-26_0848.json`, `generated_at` 08:48 NZDT):

```json
"days": [{"date": "2026-10-26", "score": 7.0, "score_remaining": 7.0,
          "remaining_from": "2026-10-26T08:00:00+13:00", "score_full_day": 8.0, "windows": 3, "...": "..."},
         {"date": "2026-10-27", "score": 6.1, "score_remaining": null,
          "remaining_from": null, "score_full_day": 6.1, "...": "..."}],
"windows": [
  {"start": "2026-10-26T08:00:00+13:00", "end": "2026-10-26T11:00:00+13:00", "score": 7.6, "rating": "great",
   "headline": "Mon 8–11am looks great", "near_best": true, "...": "..."},
  {"start": "2026-10-26T13:00:00+13:00", "end": "2026-10-26T16:00:00+13:00", "score": 5.2, "rating": "marginal",
   "headline": "Mon 1–4pm is fishable", "near_best": false, "...": "..."},
  {"start": "2026-10-26T18:00:00+13:00", "end": "2026-10-26T21:00:00+13:00", "score": 6.4, "rating": "good",
   "headline": "Mon 6–9pm looks good", "near_best": true, "...": "..."}]
```

Replayed with the clock at 00:54 (whole day) the same data gives 5–8am 8.8 (near_best), 10am–1pm 6.6 and 6–9pm 6.4 (both not near_best); before this change only 5-8am was listed.

**Copy.** Generated text has no em dashes, no spaced en dashes and no spaced hyphens used as dashes (a test checks every string in the samples and the CLI text, except the raw `spot.tide_port_linz_name`). Changed wording:

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

The day `summary` still starts with the rating word, so it now reads e.g. "Excellent, go fishing. Gentle winds all day (~10 kn); 0.3 m sea. Best: Mon 5–8am."

**Time ranges (2.3).** Window headlines, `advice`, day `summary` ("Best: Mon 8–11am"), `no_window_reason` and the CLI write hour ranges with an unspaced en dash, as the site does: `Mon 8–11am`, `Mon 10am–1pm` (was `Mon 8-11am`). Date ranges in prose (`closed 1 Sep to 10 Jan`) keep "to". The no spaced dash test still passes because the en dash is unspaced.

**LINZ port names (2.3).** LINZ writes some port names as "Area - Place" with a spaced hyphen. They are now shown as "Area (Place)" everywhere the engine writes a port name: `spot.tide_port`, `spot.tide_note`, `tide_source`, `tides[].source`, `sources[]` ("Tides: ...") and warnings. The raw LINZ name is kept in the new `spot.tide_port_linz_name` (string | null, null for freshwater spots) and is still what lookups and LINZ file names use. Names without a spaced hyphen (e.g. "Halfmoon Bay / Oban", "Wharekahika / Hicks Bay") are unchanged.

| LINZ name | shown as |
|---|---|
| `Coromandel Harbour - Whanganui Island` (spot `coromandel`) | `Coromandel Harbour (Whanganui Island)` |
| `Lottin Point - Wakatiri` (LINZ file name) | `Lottin Point (Wakatiri)` |
| `Te Whanganui / Port Underwood - Ocean Bay` | `Te Whanganui / Port Underwood (Ocean Bay)` |

Of the 21 coastal spots only `coromandel` currently matches a port with a spaced hyphen, so its `tide_port`, `tide_note` and `tide_source` change (e.g. `tide_source` "LINZ secondary port Coromandel Harbour (Whanganui Island) (offsets from Auckland)"). docs/TIDE_PORTS.md keeps the raw LINZ names.

**Brand.** Salt Supply Co (was Fish On): HTTP User-Agent `SaltSupplyCo-engine/2.0 (+https://github.com/lebrun76-lab/FIsh-on-3)`, the pyproject description, README title and the Streamlit app's titles. The package (`fishon_engine`, `fishon-engine`), the CLI script name (`fishon-forecast`) and the cache path (`~/.cache/fishon`) are unchanged.

## Window ids (2.4.0)

Every window object carries a fixed `id`, so a catch report ("How'd it go?") can record which forecast window an alert was about.

**Format.** `<spot.id>:<start>/<end>`, where `start` and `end` are the window's own ISO 8601 strings in NZ local time with offset, exactly as in `start` and `end`. Example from `docs/samples/v1_hauraki_gulf_2026-10-26.json`:

```json
{"id": "hauraki_gulf:2026-10-26T05:00:00+13:00/2026-10-26T08:00:00+13:00",
 "start": "2026-10-26T05:00:00+13:00", "end": "2026-10-26T08:00:00+13:00", "score": 8.2, "...": "..."}
```

**Stability.** The id is built only from the spot id and the window's start and end. It does not include the score, rating, confidence, `generated_at` or `engine_version`, so the same window computed on a later run gets the same id even if its score has changed. If a later run moves the window (for example 5 to 8am becomes 6 to 9am), that is a different window and gets a different id. Ids are unique within one output. Treat the id as an opaque string; do not parse it.

**Where it appears.** `windows[].id`, `days[].best_window.id`, `days[].least_bad_window.id`, `verdict.window.id` (null window stays null), `verdict.best_later.id` and `verdict.least_bad.id`. `verdict.window.id` always matches one of `windows[].id`.

**Validation.** `validate_v1` now requires `windows[].id` as a string, checks it equals `<spot.id>:<start>/<end>`, checks ids are unique, and checks `verdict.window.id` is in `windows[]`.

**`target_species`.** Each window also carries `target_species` (string or null): the species its `advice` names after "Try", for example `"Snapper"`. Null when the advice names none (no species open, or a poor least-bad window). It is also on `days[].best_window` and `days[].least_bad_window`.

**What to store per catch report.** Window `id`, `spot.id`, window `start` and `end`, window `score`, window `target_species`, and top-level `engine_version`. Storing the score and engine version next to the id lets later scoring checks tell a bad forecast from a quiet day, even after the engine is recalibrated.

**Version.** `engine_version` is `"2.4.0"` (minor bump: two new window fields and a stricter validator, no changed values). It is top level in every output and pyproject reads it from `fishon_engine.__version__`. The samples are regenerated and all report 2.4.0.

## Species scoring (2.5.0)

Says which species is worth a go and when. One line per day first, the detail under it. All fields are additive; a 2.4.0 reader ignores them. How the scores are worked out, and the sources, are in `docs/SCORING.md` (Species scoring).

**`days[].species_verdict`** (string or null). The glance line, for example from `docs/samples/v1_bay_of_islands_2026-10-26_0848.json`:

```
Tue 27 Oct: "Kahawai and snapper: Tue 6–9pm. Kingfish: Tue 5–8am."
Wed 28 Oct: "Snapper, kingfish and kahawai: Wed 5–8am."
```

Species that share a best window are grouped, best species first, at most three windows per line. Null when the day has no fishable window. When a day has fishable windows but no species scores 4.5 or more, it reads "No species scores 4.5 or more."

**`verdict.species_text`** (string or null) and **`verdict.best_by_species`** (object): the same over the verdict horizon, for the headline card.

**`days[].best_by_species`** (object): `{species name: window id}`, the window in `windows[]` where that species scores best that day. Only species scoring 4.5 or more are listed. Near ties (within the engine's confidence margin) go to the earlier window. Ordered best score first. `{}` when none.

**`windows[].species`** (array): `[{name, score, why}]`, best first. Example (Hauraki Gulf, Mon 5–8am, window score 8.2):

```json
"species": [
 {"name": "Kingfish", "score": 8.2, "why": "sea 16.9 C, dawn"},
 {"name": "Kahawai", "score": 8.2, "why": "dawn"},
 {"name": "Snapper", "score": 7.9, "why": "sea 16.9 C, slack for 1 of 3 h, dawn"},
 {"name": "Gurnard", "score": 7.9, "why": "low sea 0.1 m, no dusk"}
]
```

- Only species open on that date (`peak`, `in season`, or `no seasonal data` in `species_seasons.json`) that also have sourced conditions. Off-peak and closed species never appear. **2.6.0:** off-peak species now appear too (see below); closed species still never do.
- `score` is 0–10 and never above the window's own (safety-gated) `score`.
- `[]` on poor windows and where no species has sourced conditions (for example the freshwater spots: trout and salmon are not scored yet).

**`target_species`** is now the top entry of `windows[].species` (it was the first open main species). The advice "Try …" line follows it. Null as before when there are no species or the window is poor.

**Validation.** `validate_v1` checks these fields when present: each species entry has name, score and why; scores are 0–10, not above the window score, and sorted best first; `target_species` is the top species; every `best_by_species` id is in `windows[]`; verdict lines have no em dash or spaced dash. Older outputs without the fields still pass.

**Version.** `engine_version` is `"2.5.0"` (minor bump: new fields, and `target_species` can now name a different species). The samples are regenerated and all report 2.5.0.

## Species fairness, off-peak and water lines (2.6.0)

All additive; a 2.5.0 reader ignores the new fields. `engine_version` is `"2.6.0"` (minor bump: new fields, and species scores and order change). Samples regenerated.

**Species changes.** `windows[].species[]` entries gain `season`: `peak`, `in season`, `no seasonal data` or `off-peak`. Off-peak species (open, but outside the sourced good months) are now scored, a little lower, with "slower this time of year" first in `why`. The verdict lines say it too: `"Kingfish: Wed 5–8am (slower this time of year)."`, or in a group `"Snapper and kingfish: Wed 5–8am (kingfish slower this time of year)."`. Scores are now normalised so a species with fewer factors no longer tops by default (`docs/SCORING.md`). Example, Hauraki Gulf Mon 5–8am, window 8.2:

```json
"species": [
 {"name": "Snapper", "score": 8.0, "why": "sea 16.9 C, slack for 1 of 3 h, dawn", "season": "in season"},
 {"name": "Kingfish", "score": 7.9, "why": "no season on record here, sea 16.9 C, dawn", "season": "no seasonal data"},
 {"name": "Kahawai", "score": 7.9, "why": "no season on record here, dawn", "season": "no seasonal data"},
 {"name": "Gurnard", "score": 7.6, "why": "no season on record here, low sea 0.1 m, no dusk", "season": "no seasonal data"}
]
```

The day's best time is still shared: species only get separate times when their best windows really differ.

**Water lines, on every window and on the verdict** (strings or null, plain English, meaning first, number second, no dashes, no knots):

- `water_temp_note`: sea temperature against the species' sourced thresholds, plus the trend over the last 3 days. "Warm enough for snapper and kingfish, water's 16.9° and steady." / "A bit cold for kingfish, water's 15.4° and cooling. Fine for snapper." / "Water's cooling, 12° now." (no sourced threshold for the Dunedin species). Null with no SST (freshwater spots).
- `current_note`: an estimate of how hard the tide is running, from LINZ tide times and heights. "High tide at 7:55am. Easy fishing round the turn, but expect it to go quiet at slack water." / "Strong run on a big tide and building, so you'll want a heavier sinker. Rising till 10:35am." / "Steady run, normal sinkers should hold. Falling till 11:05am." Null where tides are not from LINZ, at Wellington and Marlborough Sounds, and at freshwater spots.
- `water_note`: the two joined with a space, or null. The verdict's three notes are the headline window's.

**`windows[].water`** (object, null at freshwater spots): the raw numbers for charts.

```json
"water": {
 "sst_c": 16.9, "sst_change_3d_c": 0.1, "sst_trend": "steady",
 "current": {
  "flow_index_avg": 0.57, "flow_index_max": 0.9, "flow_index_start": 0.9, "flow_index_end": 0.19,
  "tide_size_ratio": 0.97, "tide_range_m": 2.2, "phase": "rising",
  "turn": {"time": "2026-10-26T07:54:00+13:00", "type": "high"},
  "next_turn": {"time": "2026-10-26T07:54:00+13:00", "type": "high"}
 }
}
```

- `sst_c`: mean Open-Meteo marine SST over the window's hours. `sst_change_3d_c`: that day's mean SST minus the mean 3 days earlier (past days from a separate 1-variable call for the 3 days before the forecast; later days from the forecast). `sst_trend`: `warming`, `cooling` or `steady`, null when there is no earlier day.
- `current`: null when the current is not estimated. `flow_index_*` is an **estimate** of flow strength (1.0 = a typical mid-tide run over the fetched LINZ tides; big tides go over 1; 0 at the turn), at the start, end, average and peak of the window. `tide_size_ratio`: this tide's rate against the median. `tide_range_m`: height change of the tide at the window's end. `phase`: rising or falling at the start. `turn`: the first high or low inside the window, or null. `next_turn`: the next high or low after the window's last hour.

**Sources.** When a current is estimated, `sources[]` gains "Current: estimated from LINZ tide times and heights, not measured tidal streams". The SST history call can fail on its own; then `warnings[]` says so and there is no trend word.

**Why Open-Meteo ocean currents are not used.** They would fit the call budget (marine call 7 + 2 = 9 variables), but they are MeteoFrance SMOC at 0.08° (about 8 km), and Open-Meteo's own docs say "Accuracy at coastal areas is limited... not suitable for coastal navigation". Our marine cells sit up to 16 km (Bay of Islands) and 26 km (Marlborough) offshore, so they would describe open-water drift, not the run at a wharf or a reef. The tide-based estimate tracks the turn times exactly and the size of the tide, which is what the line is for.

**Validation.** `validate_v1` checks, when present: the three notes are strings or null with no em dash, en dash, spaced dash or knots; `water_note` equals the other two joined; `water` numbers are numbers; `sst_trend` is one of the three words; `current` has its numbers, phase and `next_turn`; a `current_note` needs a `current`; `species[].season` is one of the four statuses.
