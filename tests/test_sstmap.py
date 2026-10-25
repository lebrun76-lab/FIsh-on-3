"""Offline tests for the SST map (no network: the HTTP poster is faked)."""
import json

import pytest

from fishon_engine import sstmap as m
from fishon_engine.cache import Cache
from datetime import datetime
from fishon_engine.tz import NZ

NOW = datetime(2026, 10, 25, 23, 40, tzinfo=NZ)

SMALL = {"north": -44.0, "south": -46.0, "west": 170.0, "east": 172.0}


def test_haversine_one_degree_latitude():
    assert m.haversine_km(-40, 170, -41, 170) == pytest.approx(111.2, abs=0.2)


def test_land_mask_uses_coastline():
    land = m.load_land()
    assert m.is_land(-43.6, 172.0, land)        # Canterbury Plains
    assert m.is_land(-38.0, 176.0, land)        # central North Island
    assert not m.is_land(-40.0, 170.0, land)    # Tasman Sea
    assert not m.is_land(-46.0, 175.0, land)    # off Otago


def test_default_grid_size_is_stable():
    assert len(m.sea_points()) == 663                      # v2.1 "full" layout
    coarse, fine = m.map_points()
    assert (len(coarse), len(fine)) == (288, 181)          # v2.2 "coastal" layout: 469 calls
    land = m.load_land()
    verts = m.coast_vertices(land)
    assert all(not m.is_land(a, b, land) for a, b in fine[::10])
    assert all(m.coast_km(a, b, verts) <= m.FINE_MAX_KM for a, b in fine[::10])
    assert not any(a * 2 == round(a * 2) and b * 2 == round(b * 2) for a, b in fine)
    assert m.map_points(layout="full") == (m.sea_points(), [])


def _fake_poster(calls, value_fn):
    def poster(url, params):
        calls.append(params)
        lats = [float(x) for x in params["latitude"].split(",")]
        lons = [float(x) for x in params["longitude"].split(",")]
        return json.dumps([{"latitude": a, "longitude": b,
                            "hourly": {"time": ["2026-10-25T22:00", "2026-10-25T23:00", "2026-10-26T00:00"],
                                       "sea_surface_temperature": [value_fn(a, b) - 1, value_fn(a, b), 99]}}
                           for a, b in zip(lats, lons)])
    return poster


def test_fetch_grid_one_request_and_cached():
    calls = []
    cache = Cache(":memory:")
    poster = _fake_poster(calls, lambda la, lo: 20 + la / 4)
    g1 = m.fetch_grid(cache=cache, bbox=SMALL, poster=poster, now=NOW)
    g2 = m.fetch_grid(cache=cache, bbox=SMALL, poster=poster, now=NOW)
    assert len(calls) == 1 and g1["requests"] == 1
    assert calls[0]["hourly"] == "sea_surface_temperature" and calls[0]["forecast_days"] == "2"
    assert g2["cache"][0]["cache"] == "hit"
    assert m.SST_TTL == 12 * 3600
    assert g1["valid_time_nz"] == "2026-10-25T23:00"     # last hour <= now
    n = len(calls[0]["latitude"].split(","))
    assert g1["api_calls_counted"] == n == g1["points"]["coarse"] + g1["points"]["fine"]
    assert g1["points"]["fine"] > 0 and g1["fine"]
    vals = [v for _, _, v in m.cells(g1)]
    assert vals and all(v == pytest.approx(20 + la / 4) for la, _, v in m.cells(g1))


def test_null_cells_dropped():
    g = m.build_grid([(-44.0, 170.0), (-44.0, 170.5)], [None, 12.0], SMALL)
    assert list(m.cells(g)) == [(-44.0, 170.5, 12.0)]


def _step_grid():
    # all sea, 10 C south of -45 and 14 C at/north of -45 (a sharp front)
    lats, lons = m.grid_axes(SMALL)
    pts = [(a, b) for a in lats for b in lons]
    vals = [14.0 if a >= -45.0 else 10.0 for a, b in pts]
    return m.build_grid(pts, vals, SMALL)


def test_fronts_found_between_cells():
    fr = m.fronts(_step_grid())
    assert fr and all(f["delta_c"] == 4.0 for f in fr)
    assert {f["warm_side"] for f in fr} == {"N"}
    assert all(f["mid"][0] == -45.25 for f in fr)


def test_isotherms_follow_the_front():
    iso = m.isotherms(_step_grid())
    assert {11.0, 12.0, 13.0} <= set(iso)
    for x, y in iso[12.0][0]:
        assert -45.5 <= y <= -45.0


def test_notes_name_nearby_spots():
    ns = m.notes(_step_grid())
    text = "\n".join(ns)
    assert "Warmest water on the map: 14.0" in text
    assert "Temperature front" in text and "warmer water to the N" in text
    # Moeraki (-45.36, 170.86) and Dunedin are inside the small box, near the front
    assert "Moeraki" in text or "Dunedin" in text
    assert "Warm water edge near" in text
    assert "—" not in text and "–" not in text and " °C within" in text


def test_spot_edges_direction():
    edges = {e["spot"]: e for e in m.spot_edges(_step_grid())}
    assert "moeraki" in edges
    assert edges["moeraki"]["max_c"] == 14.0 and edges["moeraki"]["min_c"] == 10.0


def test_geojson_and_png(tmp_path):
    g = _step_grid()
    g["valid_time_nz"] = "2026-10-25T23:30"
    gj = m.to_geojson(g)
    kinds = {f["properties"]["kind"] for f in gj["features"]}
    assert kinds == {"sst_cell", "isotherm"}
    assert "CC BY 4.0" in gj["properties"]["attribution"]
    png = m.render_png(g, str(tmp_path / "x.png"))
    with open(png, "rb") as f:
        assert f.read(8) == b"\x89PNG\r\n\x1a\n"


def test_nice_time_label():
    assert m.nice_time("2026-10-25T23:30") == "Sun 25 Oct 2026 11:30pm NZDT"


def test_fine_layer_drops_duplicate_model_cells_and_renders(tmp_path):
    def poster(url, params):
        lats = [float(x) for x in params["latitude"].split(",")]
        lons = [float(x) for x in params["longitude"].split(",")]
        out = []
        for a, b in zip(lats, lons):
            fine = not (a * 2 == round(a * 2) and b * 2 == round(b * 2))
            la, lo = ((-45.875, 170.875) if fine else (a, b))     # every fine point -> one model cell
            out.append({"latitude": la, "longitude": lo,
                        "hourly": {"time": ["2026-10-25T23:00"], "sea_surface_temperature": [12.0]}})
        return json.dumps(out)
    g = m.fetch_grid(cache=Cache(":memory:"), bbox=SMALL, poster=poster, now=NOW)
    assert g["points"]["fine"] > 1 and g["points"]["fine_kept"] == len(g["fine"]) == 1
    gj = m.to_geojson(g)
    assert sum(f["properties"].get("layer") == "coastal" for f in gj["features"]) == 1
    assert m.render_png(g, str(tmp_path / "x.png"))
