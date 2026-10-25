"""NZ sea-surface-temperature map (grid, GeoJSON, PNG, plain-English notes).

Data
* SST: Open-Meteo Marine API ``current=sea_surface_temperature`` (CC BY 4.0,
  https://open-meteo.com/en/license). Free host is non-commercial only.
* Coastline / land mask: Natural Earth 1:10m Land, public domain
  (https://www.naturalearthdata.com/about/terms-of-use/), clipped to NZ and
  thinned; vendored as ``data/nz_land_ne10m.geojson``.

Call budget
Open-Meteo counts every *location* as one API call. The default 0.5 deg grid
over 34-48 S, 166-179 E has 663 sea cells after the land mask, so one refresh
costs ~663 calls but only ONE HTTP request: the coordinate lists are sent in
a single POST (a GET with that many points hits nginx "414 URI too large",
measured 2026-10-25). The body is cached in the shared SQLite cache for 6 h,
so a refresh every 6 h is ~2.7k calls/day of the free 10k/day.

Notes are computed only from the fetched grid: fronts are adjacent sea cells
whose temperature differs by >= FRONT_DELTA_C; "edges" near a spot are cells
within EDGE_RADIUS_KM spanning >= EDGE_DELTA_C.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import requests

from .cache import UA, Cache, default_cache
from .openmeteo import _host
from .spots import SPOTS
from .wind import compass

SST_TTL = 6 * 3600
BBOX = {"north": -34.0, "south": -48.0, "west": 166.0, "east": 179.0}
STEP = 0.5
MAX_POINTS_PER_REQUEST = 1000     # our own chunk size, not a documented Open-Meteo limit
FRONT_DELTA_C = 1.0
EDGE_RADIUS_KM = 75.0
EDGE_DELTA_C = 1.0
ISOTHERM_STEP = 1.0

_DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
LAND_FILE = os.path.join(_DATA, "nz_land_ne10m.geojson")
ATTRIBUTION = ("SST: Open-Meteo Marine API (CC BY 4.0). Coastline: Natural Earth 1:10m "
               "Land (public domain).")


# ---------------------------------------------------------------- geometry
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def load_land(path: str = LAND_FILE) -> List[List[Tuple[float, float]]]:
    with open(path, encoding="utf-8") as f:
        gj = json.load(f)
    return [[(c[0], c[1]) for c in ft["geometry"]["coordinates"][0]] for ft in gj["features"]]


def _in_ring(x: float, y: float, ring: Sequence[Tuple[float, float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def is_land(lat: float, lon: float, land) -> bool:
    for ring in land:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        if min(xs) <= lon <= max(xs) and min(ys) <= lat <= max(ys) and _in_ring(lon, lat, ring):
            return True
    return False


def grid_axes(bbox=BBOX, step: float = STEP) -> Tuple[List[float], List[float]]:
    nlat = int(round((bbox["north"] - bbox["south"]) / step)) + 1
    nlon = int(round((bbox["east"] - bbox["west"]) / step)) + 1
    lats = [round(bbox["north"] - i * step, 4) for i in range(nlat)]
    lons = [round(bbox["west"] + j * step, 4) for j in range(nlon)]
    return lats, lons


def sea_points(bbox=BBOX, step: float = STEP, land=None) -> List[Tuple[float, float]]:
    land = load_land() if land is None else land
    lats, lons = grid_axes(bbox, step)
    return [(la, lo) for la in lats for lo in lons if not is_land(la, lo, land)]


# ---------------------------------------------------------------- fetching
def http_post_text(url: str, params: Optional[Dict[str, Any]] = None, timeout: float = 60) -> str:
    r = requests.post(url, data=params, timeout=timeout, headers=UA)
    r.raise_for_status()
    return r.text


def fetch_grid(cache: Optional[Cache] = None, bbox=BBOX, step: float = STEP,
               poster=http_post_text, land=None) -> Dict[str, Any]:
    """Fetch SST for every sea cell. Returns a grid dict (see ``build_grid``)."""
    cache = cache or default_cache()
    pts = sea_points(bbox, step, land)
    url = _host("marine")
    results: List[Optional[float]] = []
    times: List[str] = []
    metas = []
    for i in range(0, len(pts), MAX_POINTS_PER_REQUEST):
        chunk = pts[i:i + MAX_POINTS_PER_REQUEST]
        params = {"latitude": ",".join(f"{p[0]:g}" for p in chunk),
                  "longitude": ",".join(f"{p[1]:g}" for p in chunk),
                  "current": "sea_surface_temperature", "timezone": "Pacific/Auckland"}
        key = os.environ.get("OPEN_METEO_API_KEY")
        if key:
            params["apikey"] = key
        body, meta = cache.fetch(url, params, SST_TTL, poster)
        metas.append(meta)
        data = json.loads(body)
        if isinstance(data, dict):
            if data.get("error"):
                raise RuntimeError(f"Open-Meteo error: {data.get('reason')}")
            data = [data]
        if len(data) != len(chunk):
            raise RuntimeError(f"Open-Meteo returned {len(data)} locations for {len(chunk)} requested")
        for d in data:
            cur = d.get("current") or {}
            results.append(cur.get("sea_surface_temperature"))
            if cur.get("time"):
                times.append(cur["time"])
    grid = build_grid(pts, results, bbox, step)
    grid["valid_time_nz"] = max(times) if times else None
    grid["requests"] = len(metas)
    grid["api_calls_counted"] = len(pts)
    grid["cache"] = metas
    return grid


def build_grid(points: Sequence[Tuple[float, float]], values: Sequence[Optional[float]],
               bbox=BBOX, step: float = STEP) -> Dict[str, Any]:
    lats, lons = grid_axes(bbox, step)
    li = {v: i for i, v in enumerate(lats)}
    lj = {v: j for j, v in enumerate(lons)}
    z: List[List[Optional[float]]] = [[None] * len(lons) for _ in lats]
    for (la, lo), v in zip(points, values):
        if v is not None and la in li and lo in lj:
            z[li[la]][lj[lo]] = float(v)
    return {"lats": lats, "lons": lons, "sst": z, "step": step, "bbox": dict(bbox)}


def nice_time(iso_local: Optional[str]) -> str:
    """'2026-10-25T23:30' (Pacific/Auckland wall time) -> 'Sun 25 Oct 2026 11:30pm NZDT'."""
    if not iso_local:
        return "time unknown"
    from .tz import NZ
    dt = datetime.fromisoformat(iso_local).replace(tzinfo=NZ)
    return f"{dt:%a} {dt.day} {dt:%b %Y} {dt.strftime('%I:%M%p').lstrip('0').lower()} {dt.tzname()}"


def cells(grid) -> Iterable[Tuple[float, float, float]]:
    for i, la in enumerate(grid["lats"]):
        for j, lo in enumerate(grid["lons"]):
            v = grid["sst"][i][j]
            if v is not None:
                yield la, lo, v


# ---------------------------------------------------------------- analysis
def coastal_spots():
    return [s for s in SPOTS.values() if s.is_coastal]


def nearest_spot(lat: float, lon: float, spots=None):
    spots = spots or coastal_spots()
    best = min(spots, key=lambda s: haversine_km(lat, lon, s.marine_lat, s.marine_lon))
    return best, haversine_km(lat, lon, best.marine_lat, best.marine_lon)


def where(lat: float, lon: float, spots=None) -> str:
    s, d = nearest_spot(lat, lon, spots)
    if d < 15:
        return f"at {s.name}"
    return f"{d:.0f} km {compass(bearing_deg(s.marine_lat, s.marine_lon, lat, lon))} of {s.name}"


def spot_sst(grid, spots=None, max_km: float = 60.0) -> List[Dict[str, Any]]:
    out = []
    cl = list(cells(grid))
    for s in spots or coastal_spots():
        if not cl:
            break
        la, lo, v = min(cl, key=lambda c: haversine_km(s.marine_lat, s.marine_lon, c[0], c[1]))
        d = haversine_km(s.marine_lat, s.marine_lon, la, lo)
        out.append({"spot": s.id, "name": s.name, "sst_c": v if d <= max_km else None,
                    "cell": [la, lo], "cell_km": round(d, 1)})
    return out


def fronts(grid, min_delta: float = FRONT_DELTA_C) -> List[Dict[str, Any]]:
    """Adjacent sea-cell pairs (E-W and N-S neighbours) whose SST differs by
    >= min_delta, strongest first."""
    lats, lons, z = grid["lats"], grid["lons"], grid["sst"]
    out = []
    for i in range(len(lats)):
        for j in range(len(lons)):
            a = z[i][j]
            if a is None:
                continue
            for di, dj in ((0, 1), (1, 0)):
                ii, jj = i + di, j + dj
                if ii >= len(lats) or jj >= len(lons) or z[ii][jj] is None:
                    continue
                b = z[ii][jj]
                if abs(a - b) >= min_delta:
                    d = haversine_km(lats[i], lons[j], lats[ii], lons[jj])
                    warm, cold = ((lats[i], lons[j], a), (lats[ii], lons[jj], b)) if a > b else \
                                 ((lats[ii], lons[jj], b), (lats[i], lons[j], a))
                    out.append({"delta_c": round(abs(a - b), 2), "km": round(d, 1),
                                "warm": warm, "cold": cold,
                                "mid": ((lats[i] + lats[ii]) / 2, (lons[j] + lons[jj]) / 2),
                                "warm_side": compass(bearing_deg(cold[0], cold[1], warm[0], warm[1]))})
    out.sort(key=lambda f: (-f["delta_c"] / f["km"], -f["delta_c"]))
    return out


def _declutter(items, key_latlon, min_km: float):
    kept = []
    for it in items:
        la, lo = key_latlon(it)
        if all(haversine_km(la, lo, *key_latlon(k)) >= min_km for k in kept):
            kept.append(it)
    return kept


def spot_edges(grid, spots=None, radius_km: float = EDGE_RADIUS_KM,
               min_delta: float = EDGE_DELTA_C) -> List[Dict[str, Any]]:
    """For each spot: min/max SST of sea cells within radius_km, and which way
    the warmer water lies (bearing from the coldest to the warmest cell)."""
    out = []
    cl = list(cells(grid))
    for s in spots or coastal_spots():
        near = [c for c in cl if haversine_km(s.marine_lat, s.marine_lon, c[0], c[1]) <= radius_km]
        if len(near) < 2:
            continue
        lo_c = min(near, key=lambda c: c[2])
        hi_c = max(near, key=lambda c: c[2])
        delta = hi_c[2] - lo_c[2]
        if delta >= min_delta:
            out.append({"spot": s.id, "name": s.name, "min_c": lo_c[2], "max_c": hi_c[2],
                        "delta_c": round(delta, 2), "cells": len(near),
                        "warm_cell": hi_c[:2], "cold_cell": lo_c[:2],
                        "warm_side": compass(bearing_deg(lo_c[0], lo_c[1], hi_c[0], hi_c[1])),
                        "warm_km": round(haversine_km(s.marine_lat, s.marine_lon, hi_c[0], hi_c[1]))})
    out.sort(key=lambda e: -e["delta_c"])
    return out


def isotherms(grid, step: float = ISOTHERM_STEP) -> Dict[float, List[List[Tuple[float, float]]]]:
    """Whole-degree isotherm polylines [(lon, lat), ...] via contourpy."""
    import numpy as np
    import contourpy
    z = np.array([[np.nan if v is None else v for v in row] for row in grid["sst"]], dtype=float)
    if np.all(np.isnan(z)):
        return {}
    zm = np.ma.masked_invalid(z)
    gen = contourpy.contour_generator(np.array(grid["lons"]), np.array(grid["lats"]), zm,
                                      line_type="Separate")
    lo, hi = math.ceil(np.nanmin(z) / step) * step, math.floor(np.nanmax(z) / step) * step
    out = {}
    lev = lo
    while lev <= hi + 1e-9:
        segs = [[(round(float(x), 3), round(float(y), 3)) for x, y in seg]
                for seg in gen.lines(lev) if len(seg) >= 2]
        if segs:
            out[round(lev, 1)] = segs
        lev += step
    return out


def isotherm_coast_hits(iso, spots=None, max_km: float = 60.0) -> Dict[float, List[Tuple[str, float]]]:
    """For each isotherm, coastal spots it passes within max_km of."""
    out = {}
    for lev, segs in iso.items():
        hits = []
        for s in spots or coastal_spots():
            d = min(haversine_km(s.marine_lat, s.marine_lon, y, x) for seg in segs for x, y in seg)
            if d <= max_km:
                hits.append((s.name, round(d)))
        if hits:
            out[lev] = sorted(hits, key=lambda h: h[1])
    return out


def notes(grid, spots=None, max_fronts: int = 4, max_edges: int = 5) -> List[str]:
    cl = list(cells(grid))
    if not cl:
        return ["No sea-surface temperature data in the grid."]
    spots = spots or coastal_spots()
    out = []
    hi = max(cl, key=lambda c: c[2])
    lo = min(cl, key=lambda c: c[2])
    out.append(f"Warmest water on the map: {hi[2]:.1f} °C, {where(hi[0], hi[1], spots)}. "
               f"Coldest: {lo[2]:.1f} °C, {where(lo[0], lo[1], spots)}.")
    fr = _declutter(fronts(grid), lambda f: f["mid"], 150)[:max_fronts]
    for f in fr:
        out.append(f"Temperature front {where(f['mid'][0], f['mid'][1], spots)}: "
                   f"{f['cold'][2]:.1f} → {f['warm'][2]:.1f} °C across {f['km']:.0f} km, "
                   f"warmer water to the {f['warm_side']}.")
    for e in spot_edges(grid, spots)[:max_edges]:
        out.append(f"Warm water edge near {e['name']}: {e['min_c']:.1f}–{e['max_c']:.1f} °C within "
                   f"{EDGE_RADIUS_KM:.0f} km; the warmest water ({e['max_c']:.1f} °C) is {e['warm_km']} km "
                   f"{compass(bearing_deg(*_spot_ll(e['spot']), *e['warm_cell']))} of the spot.")
    hits = isotherm_coast_hits(isotherms(grid), spots)
    for lev in sorted(hits, reverse=True):
        names = ", ".join(n for n, _ in hits[lev][:3])
        out.append(f"The {lev:.0f} °C line runs close to {names}.")
    return out


def _spot_ll(sid):
    s = SPOTS[sid]
    return s.marine_lat, s.marine_lon


# ---------------------------------------------------------------- outputs
def to_geojson(grid, iso=None) -> Dict[str, Any]:
    iso = isotherms(grid) if iso is None else iso
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [lo, la]},
              "properties": {"kind": "sst_cell", "sst_c": v, "cell_deg": grid["step"]}}
             for la, lo, v in cells(grid)]
    for lev, segs in sorted(iso.items()):
        feats.append({"type": "Feature",
                      "geometry": {"type": "MultiLineString", "coordinates": [[list(p) for p in s] for s in segs]},
                      "properties": {"kind": "isotherm", "sst_c": lev}})
    return {"type": "FeatureCollection", "features": feats,
            "properties": {"valid_time_nz": grid.get("valid_time_nz"), "attribution": ATTRIBUTION,
                           "bbox": grid["bbox"], "step_deg": grid["step"]}}


def render_png(grid, path: str, land=None, title: Optional[str] = None, spots=None) -> str:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np
    from matplotlib.patches import Polygon as MplPolygon

    land = load_land() if land is None else land
    z = np.ma.masked_invalid(np.array([[np.nan if v is None else v for v in r] for r in grid["sst"]], float))
    lats, lons, st = np.array(grid["lats"]), np.array(grid["lons"]), grid["step"]
    fig, ax = plt.subplots(figsize=(8, 9), dpi=110)
    lon_e = np.append(lons - st / 2, lons[-1] + st / 2)
    lat_e = np.append(lats + st / 2, lats[-1] - st / 2)
    vmin, vmax = math.floor(float(z.min())), math.ceil(float(z.max()))
    mesh = ax.pcolormesh(lon_e, lat_e, z, cmap="RdYlBu_r", vmin=vmin, vmax=vmax, shading="flat")
    iso = isotherms(grid)
    for lev, segs in iso.items():
        for s in segs:
            xs, ys = zip(*s)
            ax.plot(xs, ys, color="k", lw=0.6, alpha=0.6)
        longest = max(segs, key=len)
        mx, my = longest[len(longest) // 2]
        ax.text(mx, my, f"{lev:.0f}°", fontsize=7, ha="center", va="center",
                bbox=dict(boxstyle="round,pad=0.1", fc="white", ec="none", alpha=0.7))
    for ring in land:
        ax.add_patch(MplPolygon(ring, closed=True, fc="#d9d4c7", ec="#555", lw=0.5, zorder=3))
    for s in spots or coastal_spots():
        ax.plot(s.lon, s.lat, "o", ms=3, color="k", zorder=4)
        label = s.name.split(" (")[0].split(" / ")[0]
        right = s.lon < grid["bbox"]["east"] - 1.5
        ax.text(s.lon + (0.12 if right else -0.12), s.lat, label, fontsize=6, zorder=5, va="center",
                ha="left" if right else "right")
    cb = fig.colorbar(mesh, ax=ax, shrink=0.7, pad=0.02)
    cb.set_label("Sea surface temperature (°C)")
    ax.set_xlim(grid["bbox"]["west"] - st / 2, grid["bbox"]["east"] + st / 2)
    ax.set_ylim(grid["bbox"]["south"] - st / 2, grid["bbox"]["north"] + st / 2)
    ax.set_aspect(1 / math.cos(math.radians(41)))
    ax.set_xlabel("Longitude (°E)")
    ax.set_ylabel("Latitude (°)")
    ax.set_title(title or f"NZ sea surface temperature, {nice_time(grid.get('valid_time_nz'))}", fontsize=10)
    fig.text(0.01, 0.005, ATTRIBUTION + f" Grid {st}°; 1° isotherms.", fontsize=6)
    fig.tight_layout()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    return path


def build(out_dir: str, cache: Optional[Cache] = None, step: float = STEP, stamp: Optional[str] = None):
    grid = fetch_grid(cache=cache, step=step)
    stamp = stamp or datetime.now().strftime("%Y-%m-%d")
    os.makedirs(out_dir, exist_ok=True)
    png = render_png(grid, os.path.join(out_dir, f"sst_{stamp}.png"))
    gj = os.path.join(out_dir, f"sst_{stamp}.geojson")
    with open(gj, "w", encoding="utf-8") as f:
        json.dump(to_geojson(grid), f, separators=(",", ":"))
    ns = notes(grid)
    txt = os.path.join(out_dir, f"sst_notes_{stamp}.md")
    with open(txt, "w", encoding="utf-8") as f:
        f.write(f"# SST notes — valid {nice_time(grid.get('valid_time_nz'))}\n\n")
        f.write(f"Grid {step}°, {sum(1 for _ in cells(grid))} sea cells with data; "
                f"{grid['requests']} HTTP request(s), {grid['api_calls_counted']} Open-Meteo calls counted; "
                f"cache: {[m['cache'] for m in grid['cache']]}.\n\n")
        for n in ns:
            f.write(f"- {n}\n")
        f.write("\n## SST at each coastal spot (nearest grid cell)\n\n| Spot | SST °C | cell | km |\n|---|---|---|---|\n")
        for r in spot_sst(grid):
            f.write(f"| {r['name']} | {r['sst_c'] if r['sst_c'] is not None else '-'} | "
                    f"{r['cell'][0]}, {r['cell'][1]} | {r['cell_km']} |\n")
        f.write(f"\n{ATTRIBUTION}\n")
    return {"png": png, "geojson": gj, "notes_md": txt, "notes": ns, "grid": grid}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build the NZ SST map")
    ap.add_argument("--out", default="docs/sst")
    ap.add_argument("--step", type=float, default=STEP)
    a = ap.parse_args(argv)
    r = build(a.out, step=a.step)
    for n in r["notes"]:
        print("-", n)
    print(r["png"], r["geojson"], r["notes_md"])


if __name__ == "__main__":
    main()
