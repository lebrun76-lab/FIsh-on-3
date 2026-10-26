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

**Known limits.** The species factors are small next to the differences between windows, so species often share a best window. Species with fewer sourced factors lose points less often and tend to rank higher (blue cod usually tops Dunedin). Catch reports are the way to tune this.
