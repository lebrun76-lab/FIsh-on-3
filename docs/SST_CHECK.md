# SST check (Site Builder item 2, PR D item 8)

**Short answer.** The Open-Meteo marine SST is kept as is; **no bias correction**. The +0.22 °C mean difference vs NOAA Coral Reef Watch reported in engine 2.1 is explained by comparing different things: the engine's daily SST is a mean over all 24 hours (including daytime warming), while CoralTemp is a **night-only** analysis. Comparing like with like (Open-Meteo night hours vs CoralTemp), the mean difference is **+0.03 °C (22 Oct) and +0.04 °C (23 Oct)**. The per-spot scatter (sd ≈ 0.45 °C) is ten times larger than that and has a consistent sign per place, so a single offset would not improve the spots.

## v2.2 rerun (26 Oct 2026 NZDT)

`PYTHONPATH=. python tools/sst_check.py docs/sst/sst_check_v2.2_2026-10-23.json 2026-10-22 2026-10-23` (network). It samples Open-Meteo at the **new** marine points (docs/MARINE_POINTS.md) and CoralTemp v3.1 5 km (`noaacrwsstDaily`, `analysed_sst`, nominal 12:00Z) as the mean of sea pixels within ±0.06° of the Open-Meteo cell (n). Hourly Open-Meteo values and the night means are in `docs/sst/sst_check_v2.2_hourly.json`. "Night" = 12:00–18:00 UTC = 1–7am NZDT, the coolest part of Open-Meteo's daily cycle.

| Spot | OM cell | OM 23 Oct 24 h | OM 23 night | CRW 23 (n px) | 24 h − CRW | night − CRW | OM 22 24 h | OM 22 night | CRW 22 | 24 h − CRW | night − CRW | CRW anomaly 23 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bay_of_islands | -35.125, 174.208 | 16.97 | 16.81 | 17.02 (12) | -0.05 | -0.21 | 16.85 | 16.71 | 16.89 | -0.04 | -0.18 | +1.32 |
| bay_of_plenty | -37.625, 176.458 | 17.45 | 17.29 | 16.6 (12) | +0.85 | +0.69 | 17.25 | 17.09 | 16.33 | +0.92 | +0.76 | +1.39 |
| coromandel | -36.708, 175.375 | 16.8 | 16.56 | 16.52 (11) | +0.28 | +0.04 | 16.57 | 16.36 | 16.29 | +0.28 | +0.07 | +1.03 |
| east_cape | -37.708, 178.625 | 15.55 | 15.4 | 15.42 (12) | +0.13 | -0.02 | 15.35 | 15.2 | 15.06 | +0.29 | +0.14 | +0.49 |
| far_north | -34.708, 173.208 | 16.53 | 16.34 | 16.49 (16) | +0.04 | -0.15 | 16.32 | 16.23 | 16.63 | -0.31 | -0.40 | +0.59 |
| hauraki_gulf | -36.708, 175.042 | 17.23 | 16.96 | 16.56 (16) | +0.67 | +0.40 | 16.79 | 16.56 | 16.12 | +0.67 | +0.44 | +1.09 |
| hawkes_bay | -39.458, 176.958 | 15.62 | 15.39 | 15.59 (15) | +0.03 | -0.20 | 15.37 | 15.16 | 15.6 | -0.23 | -0.44 | +1.44 |
| taranaki | -39.042, 174.042 | 15.45 | 15.31 | 15.0 (13) | +0.45 | +0.31 | 15.13 | 15.03 | 14.67 | +0.46 | +0.36 | +0.45 |
| wellington | -41.375, 174.792 | 14.6 | 14.44 | 13.97 (10) | +0.63 | +0.47 | 14.19 | 14.03 | 13.66 | +0.53 | +0.37 | +0.83 |
| banks_peninsula | -43.875, 172.958 | 13.65 | 13.46 | 13.38 (9) | +0.27 | +0.08 | 13.35 | 13.13 | 13.16 | +0.19 | -0.03 | +1.89 |
| bluff | -46.625, 168.292 | 12.63 | 12.6 | 13.37 (12) | -0.74 | -0.77 | 12.55 | 12.5 | 13.23 | -0.68 | -0.73 | +1.87 |
| catlins | -46.625, 169.542 | 12.22 | 12.2 | 12.1 (12) | +0.12 | +0.10 | 12.02 | 12.0 | 11.79 | +0.23 | +0.21 | +1.28 |
| dunedin | -45.958, 170.542 | 12.44 | 12.26 | 12.55 (14) | -0.11 | -0.29 | 11.98 | 11.84 | 12.19 | -0.21 | -0.35 | +1.72 |
| fiordland | -44.542, 167.708 | 14.19 | 14.07 | 13.45 (16) | +0.74 | +0.62 | 13.92 | 13.86 | 13.54 | +0.38 | +0.32 | +0.59 |
| greymouth | -42.458, 171.208 | 14.69 | 14.56 | 14.03 (11) | +0.66 | +0.53 | 14.56 | 14.5 | 14.11 | +0.45 | +0.39 | +0.58 |
| haast_jackson | -43.792, 168.875 | 14.7 | 14.6 | 14.02 (12) | +0.68 | +0.58 | 14.53 | 14.4 | 13.36 | +1.17 | +1.04 | +1.02 |
| kaikoura | -42.458, 173.708 | 13.26 | 13.06 | 13.56 (15) | -0.30 | -0.50 | 13.18 | 12.96 | 13.63 | -0.45 | -0.67 | +1.79 |
| marlborough_sounds | -41.375, 174.208 | 14.04 | 13.83 | 13.55 (12) | +0.49 | +0.28 | 13.96 | 13.77 | 13.28 | +0.68 | +0.49 | +0.85 |
| moeraki | -45.375, 170.958 | 12.35 | 12.24 | 12.58 (12) | -0.23 | -0.34 | 12.33 | 12.03 | 12.36 | -0.03 | -0.33 | +1.52 |
| nelson_bays | -40.958, 173.208 | 16.02 | 15.81 | 16.02 (16) | +0.00 | -0.21 | 15.89 | 15.66 | 16.1 | -0.21 | -0.44 | +1.98 |
| stewart_island | -46.792, 168.292 | 12.33 | 12.3 | 12.84 (16) | -0.51 | -0.54 | 12.3 | 12.3 | 12.7 | -0.40 | -0.40 | +1.45 |

| | 23 Oct | 22 Oct |
|---|---|---|
| OM 24 h mean − CRW | mean **+0.20**, sd 0.44, range −0.74 to +0.85, mean abs 0.38 | mean **+0.18**, sd 0.48, range −0.68 to +1.17, mean abs 0.42 |
| OM night (1–7am NZDT) − CRW | mean **+0.04**, sd 0.42, range −0.77 to +0.69, mean abs 0.35 | mean **+0.03**, sd 0.48, range −0.73 to +1.04, mean abs 0.41 |
| OM diurnal range at the spot (max − min of 24 hourly values) | mean 0.43, max 0.70 °C | mean 0.39, max 0.70 °C |

(The 2.1 figure was +0.22 at the old marine points; the moved marine points and re-analysed past-day values account for the change to +0.20.) OM 8 Oct − OISST v2.1 0.25°: mean −0.43, sd 0.36, range −1.16 to +0.42, the opposite sign. CoralTemp anomaly on 23 Oct: +0.45 to +1.98 °C, positive at all 21 spots.

### Why not correct

1. **Different quantities.** CoralTemp is a night-only SST product: its ERDDAP metadata gives the data source as night-only, and Skirving et al. 2020 describe it as tuned to a depth of 20 cm (night-time, avoiding the daytime warm layer). Skirving W. et al., *CoralTemp and the Coral Reef Watch Coral Bleaching Heat Stress Product Suite Version 3.1*, Remote Sensing 12(23):3856, https://doi.org/10.3390/rs12233856. Dataset: https://coastwatch.noaa.gov/erddap/info/noaacrwsstDaily/index.html. The engine shows anglers a whole-day mean, so it is legitimately a little warmer than a night-only value.
2. **No net bias at night.** Night-vs-night the difference is +0.03/+0.04 °C, well inside product noise.
3. **Site offsets, not a global offset.** Bay of Plenty is +0.85/+0.92 both days and Bluff −0.74/−0.68 both days. A global −0.2 would make Bluff, Stewart Island, Kaikoura and Dunedin worse.
4. **Another reference disagrees in sign.** OISST says Open-Meteo is 0.43 cooler.
5. Open-Meteo's marine SST is MeteoFrance's 0.08° 6-hourly SST (Open-Meteo marine API docs, https://open-meteo.com/en/docs/marine-weather-api). We have no independent ground truth (buoys) here to justify retuning it.

The `warnings[]` note now says this in one sentence (all-hours mean; within about ±1.2 °C of CoralTemp night SST at all 21 spots; no net night bias). `days[].sst_c_avg` is the mean over **all hours** of the day. It already was in 2.1; OUTPUT.md wrongly said daylight hours and is corrected.

### Observations / caveats

- Open-Meteo's value for a **past** day changed between runs at the same cell (Moeraki 23 Oct: 12.61 on 25 Oct NZDT vs 12.35 on 26 Oct NZDT). Past-day SST is re-analysed; don't expect it to be fixed.
- See docs/MARINE_POINTS.md: Open-Meteo can take SST from a different cell than the wave cell it reports, so off-centre requests can read up to 0.8 °C different at the same nominal cell.

## Engine 2.1 check (25 Oct 2026 NZDT, old marine points), kept for history
**Question.** The site showed Hauraki Gulf 17.1 °C and Nelson Bays 16.3 °C for late October. Both looked high for spring.

**Answer.** These are real model values, not a bug. The Open-Meteo marine SST agrees with NOAA satellite SST to within about ±0.9 °C at all 21 coastal spots. NZ coastal water really is warmer than usual this month: Coral Reef Watch shows a positive anomaly at **every** spot (+0.10 to +1.98 °C), with Nelson Bays the largest. The engine keeps the Open-Meteo value. Every forecast now carries a `warnings[]` note saying where SST comes from and how it was checked.

### Method (2.1)

`tools/sst_check.py` (needs network) was run on 2026-10-25/26 NZDT. Raw rows: `docs/sst/sst_check_2026-10-23.json`.

| Source | Product | Date | How sampled |
|---|---|---|---|
| Open-Meteo Marine API `sea_surface_temperature` | the engine's source | 23 Oct and 8 Oct 2026 (UTC days) | mean of the hourly values at the marine cell Open-Meteo snaps each spot to |
| NOAA Coral Reef Watch CoralTemp v3.1, 5 km daily | `noaacrwsstDaily` (`analysed_sst`) and `noaacrwsstanomalyDaily` on https://coastwatch.noaa.gov/erddap/griddap/ | 23 Oct 2026 12:00Z | mean of 5 km sea pixels within ±0.06° of the OM cell (n in the table) |
| NOAA OISST v2.1, 0.25° | `oisst_rclone` on https://upwell.pfeg.noaa.gov/erddap/griddap/ | 8 Oct 2026 (latest final day then available) | mean of 0.25° cells within ±0.13° |

Example query (Hauraki cell): `https://coastwatch.noaa.gov/erddap/griddap/noaacrwsstDaily.csv?analysed_sst[(2026-10-23T12:00:00Z)][(-36.648):(-36.768)][(174.898):(175.018)]`

### Results (2.1)

| Spot | OM cell | OM 23 Oct | CRW 23 Oct (n px) | OM − CRW | CRW anomaly | OM 8 Oct | OISST 8 Oct (n) | OM − OISST |
|---|---|---|---|---|---|---|---|---|
| bay_of_islands | -35.125, 174.208 | 16.97 | 17.02 (12) | -0.05 | +1.32 | 16.22 | 17.11 (4) | -0.89 |
| bay_of_plenty | -37.625, 176.458 | 17.45 | 16.6 (12) | +0.85 | +1.39 | 16.05 | 16.24 (5) | -0.19 |
| coromandel | -36.708, 175.375 | 16.8 | 16.52 (11) | +0.28 | +1.03 | 15.33 | 15.79 (4) | -0.46 |
| east_cape | -37.708, 178.625 | 15.54 | 15.42 (12) | +0.12 | +0.49 | 14.85 | 14.95 (5) | -0.10 |
| far_north | -34.792, 173.125 | 16.77 | 15.94 (8) | +0.83 | +0.10 | 16.23 | 16.48 (6) | -0.25 |
| hauraki_gulf | -36.708, 174.958 | 17.23 | 16.59 (16) | +0.64 | +1.14 | 15.55 | 16.0 (2) | -0.45 |
| hawkes_bay | -39.458, 176.958 | 15.62 | 15.59 (15) | +0.03 | +1.44 | 13.94 | 13.84 (2) | +0.10 |
| taranaki | -39.042, 174.042 | 15.45 | 15.0 (13) | +0.45 | +0.45 | 14.7 | 15.17 (3) | -0.47 |
| wellington | -41.292, 174.792 | 15.0 | 14.26 (11) | +0.74 | +1.00 | 13.62 | 13.52 (3) | +0.10 |
| banks_peninsula | -43.875, 172.958 | 13.65 | 13.38 (9) | +0.27 | +1.89 | 11.9 | 12.45 (6) | -0.55 |
| bluff | -46.625, 168.292 | 12.63 | 13.37 (12) | -0.74 | +1.87 | 11.89 | 12.65 (5) | -0.76 |
| catlins | -46.625, 169.458 | 12.38 | 12.23 (10) | +0.15 | +1.35 | 11.53 | 11.68 (4) | -0.15 |
| dunedin | -45.875, 170.458 | 12.77 | 12.76 (4) | +0.01 | +1.86 | 11.45 | 12.09 (3) | -0.64 |
| fiordland | -44.542, 167.708 | 14.19 | 13.45 (16) | +0.74 | +0.59 | 13.16 | 13.5 (3) | -0.34 |
| greymouth | -42.458, 171.208 | 14.69 | 14.03 (11) | +0.66 | +0.58 | 13.45 | 14.61 (2) | -1.16 |
| haast_jackson | -43.792, 168.875 | 14.7 | 14.02 (12) | +0.68 | +1.02 | 13.2 | 14.02 (6) | -0.82 |
| kaikoura | -42.375, 173.708 | 13.52 | 13.59 (8) | -0.07 | +1.81 | 12.16 | 12.47 (3) | -0.31 |
| marlborough_sounds | -41.125, 173.958 | 14.34 | 15.06 (12) | -0.72 | +1.68 | 13.04 | 13.52 (2) | -0.48 |
| moeraki | -45.375, 170.958 | 12.61 | 12.58 (12) | +0.03 | +1.52 | 11.47 | 11.68 (5) | -0.21 |
| nelson_bays | -40.958, 173.208 | 16.02 | 16.02 (16) | +0.00 | +1.98 | 14.32 | 14.74 (4) | -0.42 |
| stewart_island | -46.792, 168.208 | 12.45 | 12.83 (16) | -0.38 | +1.41 | 11.92 | 12.61 (4) | -0.69 |

OM − CRW (23 Oct): n=21, mean +0.22, min -0.74, max +0.85, mean |diff| 0.40 °C
OM − OISST (8 Oct): n=21, mean -0.44, min -1.16, max +0.10, mean |diff| 0.45 °C
CRW anomaly 23 Oct: n=21, min +0.10, max +1.98, 21 of 21 above the 1985-2012 climatology

The site's two values match the model: Hauraki 17.23 °C on 23 Oct (the engine's live run at 23:36 NZDT on 25 Oct gave a 17.1 °C daily mean for Mon 26 Oct; see docs/sample_output_2026-10-25.txt), and Nelson 16.02 °C on 23 Oct (the site showed 16.3). Satellite SST at the same places was 16.59 and 16.02 °C, which is +1.14 and +1.98 °C above CRW's climatology.

**Shallow water.** Nelson's OM cell (-40.958, 173.208) sits inside Tasman Bay. To rule out a hot-shallows artefact, a single CRW pixel at the mouth of Tasman Bay was checked: 15.98 °C, anomaly +2.02. It is just as warm, so this is not an inlet effect.

**Context.** NIWA (Earth Sciences NZ), *Seasonal Climate Outlook October–December 2026* (1 Oct 2026), https://niwa.co.nz/climate-and-weather/seasonal-climate-outlook/seasonal-climate-outlook-october-december-2026: "Local Sea Surface Temperatures (SSTs) are near average or above average around most of New Zealand, except to the east of the North Island … While marine heatwave (MHW) conditions persist west and south of the South Island and across parts of the Tasman Sea, their extent and intensity have decreased."

### Caveats (2.1)

- OM tends to run warmer than CRW (mean +0.22 °C) and cooler than OISST two weeks earlier (mean −0.44 °C). Neither difference is large enough to change a species note.
- Some ERDDAP pixels are on the coast (small n). Bluff and Marlborough Sounds have the biggest negative differences (−0.74, −0.72).
- Per-bay SST in very shallow harbours (Kaipara, Firth of Thames) is not resolved by any of these products. No spot uses one.
