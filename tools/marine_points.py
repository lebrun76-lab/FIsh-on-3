"""PR D item 1: verify which Open-Meteo marine cell each coastal spot samples,
and pick an explicit at-sea marine point where needed.

Method (all checks against Natural Earth 1:10m land, ``sstmap.load_land``):

1. *Before*: request the marine API at the spot's current marine point with the
   default ``cell_selection`` (docs: ``sea``) and record the grid cell centre
   Open-Meteo reports, whether the request point / cell centre is on land, the
   Natural Earth sea fraction of the 1/12 deg cell (9x9 sub-samples), and
   whether the *same* cell has wave + swell + SST data when asked with
   ``cell_selection=nearest`` (if not, Open-Meteo silently mixes cells from
   different models for one "point").
2. *Candidates*: every 1/12 deg cell centre (the MeteoFrance MFWAM / SST grid,
   0.08 deg) within 22 km of the spot's reference point (its weather sea point
   if it has one, else the display coords; 40 km for Marlborough Sounds) whose
   centre is at sea and whose sea fraction is >= 0.5.
3. A candidate is *valid* if ``cell_selection=nearest`` at its centre returns
   that same cell with non-null wave_height, swell_wave_height and
   sea_surface_temperature. The nearest valid candidate to the reference wins;
   the cell already in use is kept if it is valid and within 2 km of the best.
   A spot needs an explicit marine point unless its current request point is
   at sea *and* its current cell passes every check. The explicit point is
   the chosen cell centre (3 dp), so the request itself is at sea.
4. *After*: re-request the chosen centres with the default selection and check
   the same cell and identical values come back.

Needs network (free Open-Meteo, 4 POST requests). Output:
docs/marine/marine_points_<date>.json.

    PYTHONPATH=. python tools/marine_points.py
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fishon_engine import sstmap  # noqa: E402
from fishon_engine.spots import SPOTS  # noqa: E402

URL = "https://marine-api.open-meteo.com/v1/marine"
VARS = ["wave_height", "swell_wave_height", "sea_surface_temperature"]
G = 1 / 12


def post(points, selection=None):
    out = []
    for k in range(0, len(points), 100):
        chunk = points[k:k + 100]
        data = {"latitude": ",".join(f"{a:.5f}" for a, _ in chunk),
                "longitude": ",".join(f"{b:.5f}" for _, b in chunk),
                "hourly": ",".join(VARS), "forecast_days": 1, "timezone": "UTC"}
        if selection:
            data["cell_selection"] = selection
        r = requests.post(URL, data=data, timeout=90)
        r.raise_for_status()
        j = r.json()
        out += j if isinstance(j, list) else [j]
    return out


def first(r):
    return {v: r["hourly"][v][0] for v in VARS}


def seafrac(lat, lon, land, n=9):
    k = 0
    for i in range(n):
        for j in range(n):
            k += not sstmap.is_land(lat - G / 2 + (i + .5) * G / n, lon - G / 2 + (j + .5) * G / n, land)
    return round(k / n / n, 2)


def same(a, b):
    return abs(a[0] - b[0]) < 0.01 and abs(a[1] - b[1]) < 0.01


def centres(lat, lon, km):
    i0, j0 = math.floor(lat / G), math.floor(lon / G)
    for i in range(i0 - 6, i0 + 7):
        for j in range(j0 - 6, j0 + 7):
            la, lo = round((i + .5) * G, 5), round((j + .5) * G, 5)
            if sstmap.haversine_km(lat, lon, la, lo) <= km:
                yield la, lo


def main():
    land = sstmap.load_land()
    S = [s for s in SPOTS.values() if s.is_coastal]
    before_pts = [(s.marine_lat, s.marine_lon) for s in S]
    b_sea = post(before_pts)
    b_cells = [(r["latitude"], r["longitude"]) for r in b_sea]
    b_near = post(b_cells, "nearest")

    cand = {}
    for s in S:
        ref = (s.forecast_lat, s.forecast_lon)
        km = 40 if s.id == "marlborough_sounds" else 22
        cand[s.id] = [p for p in centres(*ref, km) if not sstmap.is_land(*p, land) and seafrac(*p, land) >= 0.5]
    allc = sorted({p for v in cand.values() for p in v})
    near = dict(zip(allc, post(allc, "nearest")))

    def valid(p):
        r = near[p]
        return same(p, (r["latitude"], r["longitude"])) and all(x is not None for x in first(r).values())

    rows, chosen = [], []
    for i, s in enumerate(S):
        ref = (s.forecast_lat, s.forecast_lon)
        cell = b_cells[i]
        bn = b_near[i]
        before = dict(request=list(before_pts[i]), request_on_land=sstmap.is_land(*before_pts[i], land),
                      cell=[round(cell[0], 4), round(cell[1], 4)], cell_centre_on_land=sstmap.is_land(*cell, land),
                      cell_sea_fraction=seafrac(*cell, land),
                      km_from_display=round(sstmap.haversine_km(s.lat, s.lon, *cell), 1),
                      values=first(b_sea[i]),
                      single_cell=same(cell, (bn["latitude"], bn["longitude"])) and all(x is not None for x in first(bn).values()))
        ok = sorted([p for p in cand[s.id] if valid(p)], key=lambda p: sstmap.haversine_km(*ref, *p))
        pick = ok[0] if ok else None
        # Prefer the cell already in use when it is valid and within 2 km of the best
        # (avoids churn on ties / near-ties).
        cur = next((p for p in ok if same(p, cell)), None)
        if cur and sstmap.haversine_km(*ref, *cur) <= sstmap.haversine_km(*ref, *pick) + 2:
            pick = cur
        before["cell_ok"] = (not before["cell_centre_on_land"] and before["cell_sea_fraction"] >= 0.5
                             and before["single_cell"] and pick is not None and same(pick, cell))
        before["ok"] = before["cell_ok"] and not before["request_on_land"]
        rows.append(dict(id=s.id, name=s.name, display=[s.lat, s.lon], reference=list(ref),
                         candidates=len(cand[s.id]), valid_candidates=len(ok), before=before,
                         pick=[round(pick[0], 3), round(pick[1], 3)] if pick else None))
        chosen.append((round(pick[0], 3), round(pick[1], 3)) if pick else before_pts[i])

    a_sea = post(chosen)
    a_near = post(chosen, "nearest")
    for row, p, r, rn in zip(rows, chosen, a_sea, a_near):
        c = (r["latitude"], r["longitude"])
        row["after"] = dict(request=list(p), request_on_land=sstmap.is_land(*p, land),
                            cell=[round(c[0], 4), round(c[1], 4)], cell_centre_on_land=sstmap.is_land(*c, land),
                            cell_sea_fraction=seafrac(*c, land),
                            km_from_display=round(sstmap.haversine_km(*row["display"], *c), 1),
                            values=first(r),
                            single_cell=same(c, (rn["latitude"], rn["longitude"])) and first(rn) == first(r))
    out = dict(generated=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
               method=__doc__.strip().split("\n\n")[1], rows=rows)
    os.makedirs("docs/marine", exist_ok=True)
    path = f"docs/marine/marine_points_{dt.date.today().isoformat()}.json"
    json.dump(out, open(path, "w"), indent=1)
    print("wrote", path)
    print("MARINE_POINTS = {")
    for row in rows:
        if not row["before"]["ok"] and row["pick"]:
            print(f'    "{row["id"]}": ({row["pick"][0]}, {row["pick"][1]}),')
    print("}")
    for row in rows:
        b, a = row["before"], row["after"]
        print(f'{row["id"]:20s} ok={b["ok"]!s:5} reqland={b["request_on_land"]!s:5} B cell {b["cell"]} land={b["cell_centre_on_land"]!s:5} sf={b["cell_sea_fraction"]:.2f} single={b["single_cell"]!s:5} {b["km_from_display"]:5.1f}km '
              f'| A {a["cell"]} land={a["cell_centre_on_land"]!s:5} sf={a["cell_sea_fraction"]:.2f} single={a["single_cell"]!s:5} {a["km_from_display"]:5.1f}km valid={row["valid_candidates"]}')


if __name__ == "__main__":
    main()
