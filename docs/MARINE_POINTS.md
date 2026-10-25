# Marine sample points (PR D item 1)

Each coastal spot reads waves, swell and SST from the Open-Meteo Marine API at one point (`spot.marine_point` in the output). This page records which model cell each spot actually sampled before PR D, which ones were on or next to land, and what replaced them. Recorded by `tools/marine_points.py` at 2026-10-25T11:45:46+00:00 (Mon 26 Oct 2026 00:45 NZDT); raw rows in `docs/marine/marine_points_2026-10-26.json`. Display coordinates and shore bearings are unchanged.

## Method

1. **Before.** Request the marine API at the spot's old marine point (the region centre) with the default `cell_selection` and record the cell centre Open-Meteo reports. Check the request point and the cell centre against Natural Earth 1:10m land, and estimate the cell's sea fraction (1/12° cell, 9 × 9 sub-samples). `single cell` = with `cell_selection=nearest`, the same cell has wave, swell and SST values; if not, Open-Meteo silently mixes cells (or models) for one point.
2. **Candidates.** Every 1/12° cell centre (the MeteoFrance wave/SST grid) within 22 km of the spot's reference point (its weather sea point if it has one, else the display coordinates; 40 km for Marlborough Sounds) whose centre is at sea with sea fraction ≥ 0.5.
3. **Pick.** A candidate is valid if `nearest` at its centre returns that cell with non-null wave, swell and SST. The nearest valid candidate wins; the existing cell is kept if valid and within 2 km of the best. A spot needs an explicit point unless its old request point was at sea **and** its cell passed every check.
4. **After.** Re-request each chosen cell centre with the default selection: all 21 return the same cell, with all three variables, from a single cell.

Moved = new cell. Pinned = the old request point was on land but Open-Meteo already snapped it to a good sea cell, so that cell's centre is now requested explicitly (same data, no reliance on snapping). Unchanged = no entry in `spots.MARINE_POINTS`.

## Before / after

| Spot | Old request | on | Old cell | centre | sea frac | single cell | km from display | Result | New request (= cell centre) | sea frac | km from display |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bay_of_islands | -35.25, 174.12 | sea | -35.125, 174.208 | sea | 1.0 | yes | 16.1 | unchanged | as before | 1.0 | 16.1 |
| bay_of_plenty | -37.7, 176.5 | sea | -37.625, 176.458 | sea | 1.0 | yes | 9.1 | unchanged | as before | 1.0 | 9.1 |
| coromandel | -36.75, 175.5 | sea | -36.708, 175.375 | sea | 1.0 | yes | 12.1 | unchanged | as before | 1.0 | 12.1 |
| east_cape | -37.7, 178.5 | **land** | -37.708, 178.625 | sea | 1.0 | yes | 11.0 | pinned | -37.708, 178.625 | 1.0 | 11.0 |
| far_north | -34.8, 173.1 | **land** | -34.792, 173.125 | sea | 0.3 | **no** | 2.5 | moved | -34.708, 173.208 | 1.0 | 14.2 |
| hauraki_gulf | -36.7, 175.0 | sea | -36.708, 174.958 | sea | 1.0 | **no** | 3.8 | moved | -36.708, 175.042 | 1.0 | 3.8 |
| hawkes_bay | -39.5, 176.9 | **land** | -39.458, 176.958 | sea | 0.89 | yes | 6.8 | pinned | -39.458, 176.958 | 0.89 | 6.8 |
| taranaki | -39.06, 174.07 | **land** | -39.042, 174.042 | sea | 0.69 | yes | 3.2 | pinned | -39.042, 174.042 | 0.69 | 3.2 |
| wellington | -41.29, 174.78 | **land** | -41.292, 174.792 | **land** | 0.36 | yes | 1.0 | moved | -41.375, 174.792 | 0.99 | 9.5 |
| banks_peninsula | -43.8, 172.95 | sea | -43.875, 172.958 | sea | 0.68 | yes | 8.4 | unchanged | as before | 0.68 | 8.4 |
| bluff | -46.6, 168.33 | sea | -46.625, 168.292 | sea | 1.0 | yes | 4.0 | unchanged | as before | 1.0 | 4.0 |
| catlins | -46.55, 169.45 | **land** | -46.625, 169.458 | **land** | 0.57 | yes | 8.4 | moved | -46.625, 169.542 | 0.99 | 10.9 |
| dunedin | -45.87, 170.5 | **land** | -45.875, 170.458 | **land** | 0.0 | yes | 3.3 | moved | -45.958, 170.542 | 0.99 | 10.3 |
| fiordland | -44.55, 167.75 | sea | -44.542, 167.708 | sea | 1.0 | yes | 22.6 | unchanged | as before | 1.0 | 22.6 |
| greymouth | -42.45, 171.21 | sea | -42.458, 171.208 | sea | 0.54 | yes | 0.9 | unchanged | as before | 0.54 | 0.9 |
| haast_jackson | -43.9, 168.9 | sea | -43.792, 168.875 | sea | 1.0 | yes | 12.2 | unchanged | as before | 1.0 | 12.2 |
| kaikoura | -42.4, 173.68 | **land** | -42.375, 173.708 | **land** | 0.37 | yes | 3.6 | moved | -42.458, 173.708 | 0.93 | 6.9 |
| marlborough_sounds | -41.2, 174.0 | sea | -41.125, 173.958 | **land** | 0.28 | **no** | 9.0 | moved | -41.375, 174.208 | 1.0 | 26.1 |
| moeraki | -45.36, 170.86 | **land** | -45.375, 170.958 | sea | 1.0 | yes | 7.9 | pinned | -45.375, 170.958 | 1.0 | 7.9 |
| nelson_bays | -41.0, 173.2 | sea | -40.958, 173.208 | sea | 1.0 | yes | 4.7 | unchanged | as before | 1.0 | 4.7 |
| stewart_island | -46.9, 168.13 | **land** | -46.792, 168.208 | sea | 1.0 | **no** | 13.4 | moved | -46.792, 168.292 | 1.0 | 17.2 |

**Before:** 10 of 21 request points were on land; 5 cell centres were on land; 5 cells were less than half sea; 4 spots got values mixed from different cells. **After:** all 12 moved or pinned spots request a sea cell centre; the 9 unchanged spots already requested a sea point whose cell passed every check. Every cell now has wave, swell and SST from one cell, and all 21 cells are at least 0.54 sea (lowest: Greymouth 0.54, Banks Peninsula 0.68, Taranaki 0.69).

**Finding (open question):** for the same reported cell, requesting the off-centre point vs the cell centre gave identical waves but different SST in the first forecast hour at Bay of Plenty (17.6 vs 16.8 °C), East Cape (15.9 vs 15.3), Haast (14.8 vs 14.3), Bay of Islands (17.2 vs 17.3) and Moeraki (12.9 vs 13.0). So the cell Open-Meteo reports is the wave grid's, and SST can come from a neighbouring SST cell. East Cape and Moeraki now request the centre. Bay of Plenty, Haast and Bay of Islands were left as they were because they passed the checks; pinning them to the centre too is a one-line change in `spots.MARINE_POINTS` if wanted.

## Caveats (also in `spot.marine_point.note`)

- **Marlborough Sounds** has no valid 1/12° cell inside the Sounds; the nearest is in Cook Strait, 26.1 km from the display point. Its waves are open-strait waves, harsher than inside the Sounds.
- **Stewart Island** (17.2 km, Foveaux Strait side) and **Bay of Islands** (16.1 km, outside the bay) are also some way from the display point.
- **Fiordland** keeps its existing offshore cell (22.6 km): the fiords themselves are not resolved by the model.
- Open-Meteo marine values are model cells (~8 km), not the water at the beach.
