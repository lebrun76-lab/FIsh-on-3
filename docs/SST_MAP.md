# NZ SST map

`python -m fishon_engine.sstmap --out docs/sst [--step 0.5]` writes three files:

* `sst_<date>.png`: coloured cells, 1 °C isotherms, the coastline, spot pins and a colour legend.
* `sst_<date>.geojson`: one Point per sea cell (`sst_c`) and one MultiLineString per whole-degree isotherm.
* `sst_notes_<date>.md`: plain-English notes and the SST at each coastal spot.

The committed sample is `docs/sst/sst_2026-10-25.*`. It is a real run, valid Sun 25 Oct 2026 11:30pm NZDT.

## How it works

1. **Grid.** 34–48 °S by 166–179 °E at 0.5°, giving 29 × 27 = 783 points. Points inside the coastline polygons are dropped first, which leaves 663 sea points. Nobody pays for land points.
2. **One HTTP request.** The coordinate lists are sent as a single POST. A GET with 663 points failed with nginx `414 Request-URI Too Large` (tested 2026-10-25); 300 points by GET did work. Chunking at 1000 points is our own safety limit, not a documented Open-Meteo limit.
3. **Call cost.** Open-Meteo counts each location as one call, so a refresh is about 663 calls. Refreshing every 6 h (`SST_TTL`) comes to about 2.7k calls/day, or about 80k/month.
4. **Cache.** The response body is stored in the existing SQLite `http_cache` table, keyed by URL and params, with a TTL of 6 h. If the upstream fails, the stale copy is served.
5. **Notes.** Every number in a note comes from the fetched grid:
   * Warmest and coldest cell.
   * **Fronts:** adjacent sea cells (E–W or N–S) that differ by at least 1.0 °C. These are ranked by °C per km and decluttered to fronts at least 150 km apart.
   * **Warm water edge near a spot:** sea cells within 75 km of the spot's marine point span at least 1.0 °C. The note says how far away the warmest cell is and in which direction.
   * **Isotherms:** whole-degree contours from contourpy, which ships with matplotlib. A note lists the spots that a contour passes within 60 km of.
   * Places are named as "N km <compass> of <spot>", or "at <spot>" when within 15 km. The spot list is the existing 21 coastal spots.

## Caveats

* Open-Meteo snaps each point to its model cell. Responses come back at about 0.083° steps (e.g. -33.958, 165.958), so a 0.5° cell is a point sample, not a cell average.
* Shallow embayments can read warmer than the open sea. In the sample, the Firth of Thames and Tasman Bay cells are warm outliers, and these drive the Marlborough Sounds "edge" note. Check this before trusting edge notes inside bays.
* Some coastal sea cells return no value (null) and are left blank.
* 0.5° is about 55 km N–S, so the notes describe regional fronts, not rips or tidal fronts.

## Licences

* SST: Open-Meteo, CC BY 4.0 (https://open-meteo.com/en/license). The free host is for non-commercial use only. With `OPEN_METEO_API_KEY` set, the code switches to the `customer-` host.
* Coastline: Natural Earth 1:10m Land, public domain (https://www.naturalearthdata.com/about/terms-of-use/). The source file is `ne_10m_land.geojson` from https://github.com/nvkelso/natural-earth-vector (VERSION file says `5.2.0-pre`). It was clipped to polygons inside 164–180 °E, 33–49 °S and thinned to at least 0.02° vertex spacing, giving `fishon_engine/data/nz_land_ne10m.geojson` (23 polygons, 2,514 vertices, 47 KB).
