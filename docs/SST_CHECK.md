# SST sanity check (Site Builder item 2)

**Question.** The site showed Hauraki Gulf 17.1 °C and Nelson Bays 16.3 °C for late October. Both looked high for spring.

**Answer.** These are real model values, not a bug. The Open-Meteo marine SST agrees with NOAA satellite SST to within about ±0.9 °C at all 21 coastal spots. NZ coastal water really is warmer than usual this month: Coral Reef Watch shows a positive anomaly at **every** spot (+0.10 to +1.98 °C), with Nelson Bays the largest. The engine keeps the Open-Meteo value. Every forecast now carries a `warnings[]` note saying where SST comes from and how it was checked.

## Method

`tools/sst_check.py` (needs network) was run on 2026-10-25/26 NZDT. Raw rows: `docs/sst/sst_check_2026-10-23.json`.

| Source | Product | Date | How sampled |
|---|---|---|---|
| Open-Meteo Marine API `sea_surface_temperature` | the engine's source | 23 Oct and 8 Oct 2026 (UTC days) | mean of the hourly values at the marine cell Open-Meteo snaps each spot to |
| NOAA Coral Reef Watch CoralTemp v3.1, 5 km daily | `noaacrwsstDaily` (`analysed_sst`) and `noaacrwsstanomalyDaily` on https://coastwatch.noaa.gov/erddap/griddap/ | 23 Oct 2026 12:00Z | mean of 5 km sea pixels within ±0.06° of the OM cell (n in the table) |
| NOAA OISST v2.1, 0.25° | `oisst_rclone` on https://upwell.pfeg.noaa.gov/erddap/griddap/ | 8 Oct 2026 (latest final day then available) | mean of 0.25° cells within ±0.13° |

Example query (Hauraki cell): `https://coastwatch.noaa.gov/erddap/griddap/noaacrwsstDaily.csv?analysed_sst[(2026-10-23T12:00:00Z)][(-36.648):(-36.768)][(174.898):(175.018)]`

## Results

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

## Caveats

- OM tends to run warmer than CRW (mean +0.22 °C) and cooler than OISST two weeks earlier (mean −0.44 °C). Neither difference is large enough to change a species note.
- Some ERDDAP pixels are on the coast (small n). Bluff and Marlborough Sounds have the biggest negative differences (−0.74, −0.72).
- Per-bay SST in very shallow harbours (Kaipara, Firth of Thames) is not resolved by any of these products. No spot uses one.
