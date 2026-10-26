# Scoring 2.1: recalibration (Site Builder item 3, "scores too optimistic")

The score is a transparent 0–10 heuristic, **not** a catch-rate model. There is no catch data to fit against yet, so "calibrated" here means: given a real week of forecasts, the label bands the site uses (great ≥ 7.5, good ≥ 6, marginal ≥ 4.5, poor) should land on days an experienced angler would describe the same way. The weights are in `fishon_engine/scoring.py` (`WEIGHTS`, with `WEIGHTS_V20` kept for comparison).

## Why 2.0 was optimistic

1. **Free points.** With base 3.0 + dry hour 0.5 + dawn/dusk 1.0 + tide run-in 0.75 + moon 0.3, an ordinary dawn collected 5.55 before wind and sea counted. Most hours are dry and every day has two light changes, so these points barely separate days but lift every best window.
2. **Gusts were nearly free.** Nothing was deducted below 25 kn, and 25–35 kn cost only 1.0.
3. **Coarse sea bands.** Everything under 0.8 m got the same +1.5, so 0.7 m chop scored like a millpond.
4. **Land-cell winds** (see WEATHER_POINTS.md). Lighter mean winds from land cells inflated wind points at many spots.

## Changes

| Factor | 2.0 | 2.1 | Reason |
|---|---|---|---|
| base | 3.0 | 2.5 | remove the floor lift |
| wind <6 / <10 / <15 / <20 / <25 / ≥25 kn | +2.0 / +1.5 / +0.5 / −1.0 / −2.0 / −3.5 | +2.5 / +1.75 / +0.5 / −1.0 / −2.25 / −3.75 | wind is the main go/no-go, so give it more spread |
| offshore/cross-offshore <15 kn | +0.75 | +0.5 | the facing bearings are still first-pass |
| gusts | <25: 0, <35: −1.0, ≥35: −2.0 | <20: 0, <25: −0.5, <35: −1.25, ≥35: −2.25 | gusts of 20–25 kn matter in a small boat |
| gust ratio (new) | – | −0.5 if gust > 1.8 × mean and mean ≥ 8 kn | squally conditions |
| sea (wave height) | <0.8: +1.5, <1.5: +0.75, <2.5: −0.5, <3.5: −1.5, else −3.0 | <0.5: +2.0, <1.0: +1.25, <1.5: +0.25, <2.5: −0.75, <3.5: −1.75, else −3.25 | separate flat from merely OK |
| rain | dry +0.5, <2 mm −0.5, ≥2 −1.5 | dry +0.25, <2 −0.75, ≥2 −1.75 | a dry hour is the norm, not a bonus |
| dawn/dusk / dark | +1.0 / −1.0 | +0.75 / −1.25 | keep the light bonus but stop it carrying a bad day |
| tide run-in | +0.75 | +0.5 | |
| moon | +0.3 | +0.25 | weak evidence |
| best possible hour | 10.3 (clamped to 10) | 9.75 | 10 should not be routine |

Day score is unchanged: 0.6 × best window + 0.4 × the mean of daylight hours, now rounded **before** rating so the day's text and rating always agree.

## Effect on a real week

`tools/score_distribution.py` was run on 2026-10-26 00:1x NZDT: 21 coastal spots, 7 days from 2026-10-27, 147 spot-days. Raw: `docs/scoring/score_distribution_2026-10-26.json`. The middle column uses the new weather points with the old weights, which isolates the weight change.

| | 2.0 | 2.1 points + 2.0 weights | **2.1** |
|---|---|---|---|
| best window, median | 7.0 | 6.6 | **5.6** |
| best window, p90 | 8.4 | 8.5 | **8.0** |
| best window, max | 9.3 | 9.6 | **8.8** |
| best windows ≥ 7.5 ("great") | 38.1 % | 40.1 % | **23.8 %** |
| best windows ≥ 8 | 23.1 % | 23.8 % | **12.2 %** |
| best windows < 4.5 ("poor") | 20.4 % | 22.4 % | **32.7 %** |
| day score, median | 6.0 | 6.1 | **5.0** |
| day score, p90 | 7.94 | 8.0 | **7.44** |
| day score ≥ 8 | 10.2 % | 10.9 % | **1.4 %** |
| daylight hours, median | 5.0 | 5.0 | **4.0** |

In 2.0, almost 4 in 10 spot-days had a "great" window. In 2.1 it is about 1 in 4, and great *days* are rare. The best calm dawns still score in the 8s. Example from the docs sample: Hauraki Gulf, Mon 26 Oct 5–8am, NW 8 kn, 0.1 m sea, run-in to high tide, 8.2 great.

Sanity tests (`tests/test_scoring.py`):
- A calm dawn (4 kn, 0.3 m) is ≥ 7.5.
- An ordinary midday hour (12 kn, gusts 18, 0.8 m, dry) is marginal, 4.5–6.
- The same hour at 1.2 m is poor.
- 2.0 scored that ordinary hour higher.

## Still to do

The weights are judgement, informed by one week of data. Logging user catch reports, plus Alex's local knowledge (facings, which spots handle a south-westerly), is the way to tune them properly.

## Species scoring (2.5.0)

The window score says whether it is worth going. The species score says what to fish for once you are there. It is built on top of the window score and can only take points off:

```
species score = window score − penalties for sourced conditions the window misses
clamped to 0 … window score
```

So a species score is never higher than the window's safety-gated score. A rough day stays rough for every species.

**Which species.** Those that `species_seasons.json` has open on the date (`peak`, `in season`, or `no seasonal data`). Off-peak and closed species are left out. A species is also left out if `fishon_engine/data/species_conditions.json` has no entry for it.

**Factors.** Each factor is applied per hour of the window and averaged, so missing one hour of three costs a third of the penalty. Missing data (no SST, no tide) costs nothing and is noted in `why`. Every factor cites at least one source in `species_conditions.json`. The penalty sizes and the gurnard 1.0 m threshold are engine tuning, not from the sources.

| Species | Factor | Penalty | Source |
|---|---|---|---|
| Snapper | Sea under 14.8 C | 0.5 | Parsons et al. 2014, NZ J Marine & Freshwater Research 48(2) (spawning aggregations from about 14.8–16 C); NIWA (spring migration about 16 C) |
| Snapper | Tide running (slack is within 0.75 h of a turn) | 0.75 | fishing.net.nz, "How to catch snapper" |
| Snapper | Dawn or dusk change of light | 0.5 | fishing.net.nz, "How to catch snapper" |
| Kingfish | Sea under 16 C | 0.75 | Mark Draper, "Kingfish from the rocks pt 1", NZ Fishing News 2008; NIWA kingfish growth trials (2014) |
| Kingfish | Dawn | 0.5 | fishing.net.nz, "Using bite times" |
| Kahawai | Dawn or dusk | 0.5 | Peter Davy, "Clutha River mouth kahawai", NZ Fishing Magazine 2026 |
| Gurnard | Sea under 1.0 m (no white water) | 1.0 | Andy Macleod, "Land based gurnard fishing", NZ Fishing News 2018; fishing.net.nz, "Expert tips to catch gurnard" |
| Gurnard | Dusk | 0.25 | fishing.net.nz, "Expert tips to catch gurnard" |
| Tarakihi | Tide running | 0.75 | Sam Boothroyd, "Chasing sea turkeys", NZ Fishing News 2021 |
| Blue cod | Daylight (penalty × share of dark hours) | 1.0 | University of Auckland lateral line research (diurnal predator); fishing.net.nz, "How to catch blue cod from the shore" |

Full citations and URLs are in the JSON.

**Left out, and why.**

- Snapper, moon: mixed evidence, no NZ research found. Snapper, which tide: local.
- Kingfish, tide: sources only say "some spots".
- Kahawai, tide: sources disagree. Kahawai, clarity after rain: sourced but not modelled (needs rain history, river mouths only).
- Gurnard, tide: differs by coast. Gurnard, sea temperature: no range given.
- Tarakihi, light and sea temperature: no source found.
- Blue cod, tide and dawn/dusk: a Fisheries NZ pot survey (BCO9701, Marlborough Sounds) found no tide or time-of-day effect.
- Tuna (southern bluefin, Pacific bluefin, albacore): no usable preference found. Fisheries NZ reports only give season sea temperatures. They are also offshore boat fish that the shore safety gate does not describe.
- Not scored at all (no conditions entry yet): trevally, john dory, hāpuku/groper, barracouta, trout and salmon.

**Best window per species.** Per day, the window where the species scores highest, if 4.5 or more. Near ties (within the confidence margin) go to the earlier window. The verdict line groups species that share a window: "Kahawai and snapper: Tue 6–9pm. Kingfish: Tue 5–8am."

**Known limits.** The species factors are small next to the differences between windows, so species often share a best window. Species with fewer sourced factors lose points less often and tend to rank higher (blue cod usually tops Dunedin). Catch reports are the way to tune this. **Fixed in 2.6.0, below.**

## Species fairness and off-peak (2.6.0)

**The problem.** In 2.5.0 each missed factor cost its own penalty. Kingfish had 2 factors (1.25 points at stake), snapper 3 (1.75), kahawai 1 (0.5). So kingfish and kahawai lost less on the same window and topped the Gulf and Bay of Islands on dawn windows, just for having fewer factors.

**The method: normalise by the factors each species has.**

```
species score = window score
              − PENALTY_BUDGET × (weight of factors missed ÷ weight of all its factors)
              − season penalty
clamped to 0 … window score
```

- Each species can now lose the same most (1.5) for missed conditions, however many factors it has. The penalties in `species_conditions.json` are now relative weights within a species.
- Season penalty: `peak` 0, `in season` 0, `no seasonal data` 0.25, `off-peak` 0.5. A species with no season on record for the spot (kingfish and kahawai in the Gulf) loses a little to one whose season is sourced and on (snapper, October), so snapper wins equal conditions in the Gulf and Bay of Islands.
- Equal scores keep the season order (peak, in season, no seasonal data, off-peak), then the file order.

Effect on the real samples: snapper now tops 19 of 20 Bay of Islands windows (2.5.0: 9, with kingfish 7 and kahawai 4) and 5 of 9 Gulf windows (2.5.0: 1). Kahawai and gurnard still top some Gulf dusk windows, where snapper misses some running tide and gurnard gets its dusk. Blue cod still tops Dunedin: none of the three Dunedin species has a season on record.

**Trade-off.** One-factor species swing harder: kahawai at midday loses the whole 1.5 for "no dawn or dusk". That is the price of each species having the same at stake.

**Off-peak.** Open but outside the sourced good months (for example Cook Strait kingfish in October: sourced Dec to Feb). Scored now, 0.5 lower, with "slower this time of year" in `why` and the verdict. Closed species are still never scored.

**Tuning, not sourced:** `PENALTY_BUDGET` 1.5, the season penalties (0.25 and 0.5), the factor weights, and the gurnard 1.0 m threshold. The thresholds themselves (snapper 14.8 C, kingfish 16 C), the factors and the season months are sourced.

## Water and current lines (2.6.0)

Code: `fishon_engine/water.py`. Fields: `docs/OUTPUT.md`.

**Water temperature line.** Window mean SST (Open-Meteo marine), checked against each scored species' sourced `sst_min` (snapper 14.8 C, kingfish 16 C): at or over is "warm enough", up to 1 C under is "a bit cold", more is "too cold". Species without a sourced threshold get no temperature verdict, just the number and trend. Trend: that day's mean SST against the mean 3 days earlier, using a real fetch of the 3 days before the forecast. Temperatures show whole degrees, or one decimal within 1 C of a threshold.

**Current line: an estimate from LINZ tides.** No free, trustworthy inshore current data exists for our spots (table below), so the line estimates flow from the LINZ tide predictions. On a cosine tide the height changes fastest mid-tide and not at all at the turn, and the flow follows it. For the hour's middle:

```
flow_index = sin(π × share of the tide gone) × (π × range ÷ 2 × duration) ÷ median of that over the fetched LINZ tides
```

1.0 is a typical mid-tide run for that spot. It knows the turn times and the tide size, nothing about local streams, eddies, wind drift or how a headland bends the flow. It is only given where tides come from LINZ, never from the Open-Meteo modelled sea level, and not at Wellington (LINZ: "tidal streams in and around Cook Strait are unreliable") or Marlborough Sounds (channel streams of 5–7 knots that the Picton curve can't describe).

| Cut-off | Value | Tuning? |
|---|---|---|
| Turn inside the window | any high or low between start and end | rule |
| Strong run ("heavier sinker") | flow_index ≥ 1.1 (window average; window peak if a turn is inside) | tuning |
| Steady run ("normal sinkers should hold") | 0.5 to 1.1 | tuning |
| Not much current | < 0.5 | tuning |
| Big tide / small tide | tide rate ≥ 1.15 / < 0.85 × median | tuning |
| Building / easing | flow_index end vs start differs by more than 0.15 | tuning |
| SST steady | 3-day change under 0.4 C | tuning |
| "A bit cold" band | up to 1 C under the sourced threshold | tuning |
| Slack | within 0.75 h of a turn (the engine's existing rule) | tuning |

**Inshore current sources checked (Oct 2026).**

| Source | What | Licence | Trust close to shore |
|---|---|---|---|
| LINZ tide predictions | High and low times and heights, standard and secondary ports | CC BY 4.0 | Good for heights and turn times; basis of our estimate |
| LINZ tidal stream predictions | Streams for Te Aumiti/French Pass and Tory Channel only (2025–2029 CSV/PDF) | CC BY 4.0 | Good at those two channels only; LINZ calls Cook Strait streams unreliable. None of our spots |
| NIWA / Earth Sciences NZ Tide Forecaster | Tide heights, open coast (inside harbours only Wellington, Waitematā, Lyttelton), about ±0.1 m and 5–15 min | Their terms, free to view | Heights only, no currents |
| MetService Tide API | Tide heights; states "no tidal currents" | MetService API terms; beta full, general release second half of Nov 2026 | Heights only |
| MetService/MetOcean Point Forecast API | Surface and barotropic current vectors, with and without tide | Paid API key; licence not established | Unknown inshore; not used because it costs money |
| Marlborough District Council Tory Channel current model | Machine learning model checked against ADCP | No public API found | Good there; not available |
| Open-Meteo marine currents | `ocean_current_velocity`/`direction`, MeteoFrance SMOC 0.08° (about 8 km), hourly, includes waves and tides | CC BY 4.0, free tier non-commercial | Low: their docs say coastal accuracy is limited and not for coastal navigation; our cells are up to 26 km offshore. Not used |
