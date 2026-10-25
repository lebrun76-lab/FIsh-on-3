# NZ SST map

`python -m fishon_engine.sstmap --out docs/sst [--full]` writes three files:

* `sst_<date>.png`: coloured cells, 1 °C isotherms, the coastline, spot pins and a colour legend.
* `sst_<date>.geojson`: one Point per sea cell (`sst_c`) and one MultiLineString per whole-degree isotherm.
* `sst_notes_<date>.md`: plain-English notes and the SST at each coastal spot.

The committed sample is `docs/sst/sst_2026-10-26.*` (2.2 coastal layout), a real run valid Mon 26 Oct 2026 12:00am NZDT: 469 calls counted, 1 HTTP request. The 2.1 sample `docs/sst/sst_2026-10-25.*` (663-cell grid) is kept for comparison.

## How it works

1. **Grid (2.2 `coastal` layout, default).** Start from 34–48 °S by 166–179 °E at 0.5° (29 × 27 = 783 points, 663 at sea). Keep only the 0.5° sea cells within 150 km of the coast (**288**), and add a finer **0.25°** layer of sea points within 25 km of the coast that are not on the 0.5° lattice (**181**). Total **469** locations. Land points are never requested. `--full` / `layout="full"` restores the 2.1 663-cell grid.
2. **One HTTP request.** The coordinate lists are sent as a single POST. A GET with 663 points failed with nginx `414 Request-URI Too Large` (tested 2026-10-25); 300 points by GET did work. Chunking at 1000 points is our own safety limit, not a documented Open-Meteo limit.
3. **Call cost.** Open-Meteo counts each location as one call. 2.2 asks for two days of hourly SST and uses the latest hour at or before "now", so the cached body stays valid for **12 h** (`SST_TTL`); the MeteoFrance SST behind the marine API is updated once a day (Open-Meteo marine API docs). See the table below.
4. **Cache.** The response body is stored in the existing SQLite `http_cache` table, keyed by URL and params, with a TTL of 12 h. If the upstream fails, the stale copy is served.
5. **Notes.** Every number in a note comes from the fetched grid:
   * Warmest and coldest cell.
   * **Fronts:** adjacent sea cells (E–W or N–S) that differ by at least 1.0 °C. These are ranked by °C per km and decluttered to fronts at least 150 km apart.
   * **Warm water edge near a spot:** sea cells within 75 km of the spot's marine point span at least 1.0 °C. The note says how far away the warmest cell is and in which direction.
   * **Isotherms:** whole-degree contours from contourpy, which ships with matplotlib. A note lists the spots that a contour passes within 60 km of.
   * Places are named as "N km <compass> of <spot>", or "at <spot>" when within 15 km. The spot list is the existing 21 coastal spots.

## Calls and resolution, 2.1 vs 2.2

| | 2.1 (`--full`) | 2.2 (`coastal`) |
|---|---|---|
| Locations per refresh | 663 (0.5°) | 469 (288 at 0.5° + 181 at 0.25°) |
| Refresh interval | 6 h | 12 h |
| Calls/day | ~2,652 | ~938 |
| Calls/month (30 d) | ~79.6k | ~28.1k |
| Spot → nearest SST cell, median / max (21 coastal spots) | 24.4 km / 37.7 km | 6.0 km / 22.6 km |
| Coverage | the whole 34–48 °S, 166–179 °E box | within 150 km of the coast (the far-offshore Tasman/Pacific cells are dropped) |

Note that the 0.25° points are still point samples of Open-Meteo's ~0.08° SST grid; 180 of the 181 fine points were kept in the sample (one was a null or a duplicate model cell).

## Caveats

* Open-Meteo snaps each point to its model cell. Responses come back at about 0.083° steps (e.g. -33.958, 165.958), so a 0.5° cell is a point sample, not a cell average.
* Shallow embayments can read warmer than the open sea. In the sample, the Firth of Thames and Tasman Bay cells are warm outliers, and these drive the Marlborough Sounds "edge" note. Check this before trusting edge notes inside bays.
* Some coastal sea cells return no value (null) and are left blank.
* 0.5° is about 55 km N–S and 0.25° about 28 km, so the notes describe regional fronts, not rips or tidal fronts.

## Licences

* SST: Open-Meteo, CC BY 4.0 (https://open-meteo.com/en/license). The free host is for non-commercial use only. With `OPEN_METEO_API_KEY` set, the code switches to the `customer-` host.
* Coastline: Natural Earth 1:10m Land, public domain (https://www.naturalearthdata.com/about/terms-of-use/). The source file is `ne_10m_land.geojson` from https://github.com/nvkelso/natural-earth-vector (VERSION file says `5.2.0-pre`). It was clipped to polygons inside 164–180 °E, 33–49 °S and thinned to at least 0.02° vertex spacing, giving `fishon_engine/data/nz_land_ne10m.geojson` (23 polygons, 2,514 vertices, 47 KB).
