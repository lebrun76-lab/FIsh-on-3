# Weather points (Site Builder item 4: gusts 2–2.6× the mean)

**Finding.** The high gust ratios came from where the weather was sampled, not from the scoring. Open-Meteo's forecast API picks a model grid cell with `cell_selection=land` by default (https://open-meteo.com/en/docs: "land" prefers land cells with a similar elevation, "sea" prefers sea cells). Several region centres are also on land: Natural Earth 1:10m land puts 10 of the 21 coastal centres on land. Over land, gusts are high compared with a mean wind that terrain has slowed. At sea the ratio is about 1.4–1.5.

**Fix (engine 2.1).**
1. Coastal spots now request `cell_selection=sea`.
2. Where the centre is on land or right on the coast, a separate **weather point** (`Spot.wx_lat/wx_lon`, `spots.WX_POINTS`) moves the sample a few km out to sea, toward the fishing water. Candidates were checked against Natural Earth land polygons and the Open-Meteo elevation API (elevation 0). Every chosen point passed both checks.
3. **Unchanged:** the spot's display `lat`/`lon`, the facing bearings (`facing_deg`; left for Alex to review), the LINZ tide-port match, and the marine (wave/SST) point. The marine API already snaps to the nearest sea cell.

Each forecast exposes the point it used in `spot.forecast_point` `{lat, lon, cell_selection, model_cell{lat,lon,elevation_m}, note}`, so the site can show it.

## Before / after

Data: the 21 coastal spots, 7 days from 2026-10-27, the same fetch window for every setup (`tools/score_distribution.py`, `docs/scoring/score_distribution_2026-10-26.json`). "2.0" means centre plus default land cell. "2.1" means weather point plus sea cell. Gust/mean is the median of hourly gust ÷ mean wind over all hours with a mean wind of at least 5 kn. Mean wind is over all hours.

| Spot | Display centre (unchanged) | Centre on land (Natural Earth)? | Weather point 2.1 | Moved km | Gust/mean median 2.0 → 2.1 | Mean wind kn 2.0 → 2.1 |
|---|---|---|---|---|---|---|
| bay_of_islands | -35.25, 174.12 | no | -35.244, 174.128 | 1.0 | 2.25 → 1.43 | 6.8 → 6.7 |
| bay_of_plenty | -37.7, 176.5 | no | same (sea cell only) | 0.0 | 1.92 → 1.43 | 9.8 → 12.8 |
| coromandel | -36.75, 175.5 | no | -36.759, 175.481 | 2.0 | 2.45 → 1.43 | 10.3 → 13.7 |
| east_cape | -37.7, 178.5 | yes | -37.671, 178.544 | 5.0 | 2.26 → 1.37 | 8.6 → 13.3 |
| far_north | -34.8, 173.1 | yes | -34.76, 173.17 | 7.8 | 2.08 → 1.42 | 8.7 → 9.7 |
| hauraki_gulf | -36.7, 175.0 | no | same (sea cell only) | 0.0 | 2.01 → 1.41 | 11.5 → 13.3 |
| hawkes_bay | -39.5, 176.9 | yes | -39.506, 176.946 | 4.0 | 2.15 → 1.47 | 9.0 → 10.7 |
| taranaki | -39.06, 174.07 | yes | -39.0, 174.0 | 9.0 | 1.81 → 1.36 | 11.3 → 17.2 |
| wellington | -41.29, 174.78 | yes | -41.312, 174.832 | 5.0 | 2.17 → 1.45 | 14.4 → 11.9 |
| banks_peninsula | -43.8, 172.95 | no | -43.808, 172.956 | 1.0 | 3.12 → 1.53 | 6.2 → 8.5 |
| bluff | -46.6, 168.33 | no | -46.616, 168.317 | 2.0 | 1.97 → 1.4 | 15.8 → 19.4 |
| catlins | -46.55, 169.45 | yes | -46.601, 169.524 | 8.0 | 2.34 → 1.45 | 11.5 → 16.7 |
| dunedin | -45.87, 170.5 | yes | -45.917, 170.539 | 6.0 | 2.34 → 1.42 | 8.8 → 12.8 |
| fiordland | -44.67, 167.93 | no | -44.55, 167.75 | 19.5 | 4.03 → 1.49 | 6.0 → 14.7 |
| greymouth | -42.45, 171.21 | no | -42.45, 171.198 | 1.0 | 2.49 → 1.42 | 9.9 → 14.7 |
| haast_jackson | -43.9, 168.9 | no | same (sea cell only) | 0.0 | 2.46 → 1.48 | 8.3 → 12.3 |
| kaikoura | -42.4, 173.68 | yes | -42.4, 173.717 | 3.0 | 2.81 → 1.45 | 3.3 → 5.0 |
| marlborough_sounds | -41.2, 174.0 | no | same (sea cell only) | 0.0 | 2.7 → 1.56 | 9.9 → 9.1 |
| moeraki | -45.36, 170.86 | yes | -45.36, 170.886 | 2.0 | 1.99 → 1.52 | 8.3 → 8.4 |
| nelson_bays | -41.0, 173.2 | no | same (sea cell only) | 0.0 | 1.49 → 1.49 | 12.5 → 12.5 |
| stewart_island | -46.9, 168.13 | yes | -46.914, 168.147 | 2.0 | 2.53 → 1.53 | 13.6 → 14.0 |

The gust/mean median was 1.81–4.03 before and is 1.36–1.56 after. Nelson Bays was already resolving to a sea cell, so it is unchanged.

**Trade-off.** Mean winds rise at most spots (for example Taranaki 11.3 → 17.2 kn, Fiordland 6.0 → 14.7 kn), because exposed water is windier than a sheltered land cell. That is the wind a boat will meet. A shore angler in the lee may see less. The scoring treats this through the facing (offshore vs onshore), which Alex is reviewing.

Tests: `tests/test_points.py` checks that every weather point is at sea (Natural Earth, offline) and within 25 km of the centre. It also checks that facings and display coordinates are identical to commit 54ae5da.
