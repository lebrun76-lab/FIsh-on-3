"""End-to-end with no network: synthetic Open-Meteo JSON + real LINZ excerpt."""
import json
import math
import os
from datetime import date, datetime, timedelta

import pytest

from conftest import FIX
from fishon_engine import contract, engine, openmeteo, tides
from fishon_engine.cache import Cache
from fishon_engine.tz import NZ, UTC

START = date(2026, 10, 27)


def _hours(n=48):
    t0 = datetime.combine(START, datetime.min.time(), NZ)
    return [int((t0 + timedelta(hours=i)).timestamp()) for i in range(n)]


def fake_forecast(lat, lon, s, e, cache=None, cell_selection="land"):
    ts = _hours()
    return {"hourly": {"time": ts, "wind_speed_10m": [4 + (i % 24) for i in range(48)],
                       "wind_direction_10m": [270] * 48, "wind_gusts_10m": [10] * 48,
                       "precipitation": [0.0] * 48, "pressure_msl": [1015] * 48,
                       "temperature_2m": [14] * 48, "cloud_cover": [20] * 48},
            "daily": {"time": [ts[0], ts[24]],
                      "sunrise": [ts[6] + 1500, ts[30] + 1440], "sunset": [ts[20] + 900, ts[44] + 960]},
            "_cache": {"cache": "miss"}}


def fake_marine(lat, lon, s, e, cache=None):
    ts = _hours()
    return {"hourly": {"time": ts, "wave_height": [0.6] * 48, "swell_wave_height": [0.5] * 48,
                       "swell_wave_period": [9] * 48, "swell_wave_direction": [180] * 48,
                       "wind_wave_height": [0.2] * 48, "sea_surface_temperature": [12.8] * 46 + [None, None],
                       "sea_level_height_msl": [math.cos(2 * math.pi * (i - 3) / 12.42) for i in range(48)]},
            "_cache": {"cache": "miss"}}


def fake_linz(port, s, e, cache=None):
    with open(os.path.join(FIX, "linz_port_chalmers_2026_excerpt.csv"), encoding="utf-8") as f:
        return tides.parse_linz_csv(f.read())


@pytest.fixture
def patched(monkeypatch):
    monkeypatch.setattr(openmeteo, "fetch_forecast", fake_forecast)
    monkeypatch.setattr(openmeteo, "fetch_marine", fake_marine)
    monkeypatch.setattr(tides, "fetch_linz", fake_linz)


def test_forecast_structure(patched):
    fc = engine.forecast_spot("dunedin", start=START, days=2, compare_tides=True)
    assert contract.validate_v1(fc) == []
    assert fc["api_version"] == "1" and fc["hourly_step_h"] == 1
    assert fc["timezone"] == "Pacific/Auckland" and fc["tide_source"].startswith("LINZ")
    assert fc["tide_datum"] == "chart_datum" and {t["datum"] for t in fc["tides"]} == {"chart_datum"}
    assert len(fc["days"]) == 2 and len(fc["hourly"]) == 48
    d0 = fc["days"][0]
    assert d0["date"] == "2026-10-27" and d0["sunrise"].endswith("+13:00")
    assert len(d0["blocks_3h"]) == 8 and d0["sst_c_avg"] == 12.8
    assert "species" not in d0 and "tides" not in d0 and fc["species"]
    bw = d0["best_window"]
    assert bw["start"].startswith("2026-10-27T") and "offshore" in bw["advice"]
    assert [t["type"] for t in fc["tides"]][:2] == ["high", "low"]
    h = fc["hourly"][10]
    assert h["wave_m"] == 0.6 and h["swell_m"] == 0.5 and h["tide_m"] is not None
    assert fc["model_run"].startswith("ECMWF IFS 2026-10-25T00:00Z")
    assert fc["spot"]["lat"] == -45.87 and fc["spot"]["island"] == "South"
    assert fc["spot"]["forecast_point"] == {"lat": -45.917, "lon": 170.539, "cell_selection": "sea",
                                            "model_cell": None, "note": fc["spot"]["forecast_point"]["note"]}
    assert fc["tide_comparison"]["matched"] > 0
    json.dumps(fc, allow_nan=False)


def test_coastal_uses_sea_cell_at_weather_point(patched, monkeypatch):
    seen = []

    def spy(lat, lon, s, e, cache=None, cell_selection="land"):
        seen.append((lat, lon, cell_selection))
        return fake_forecast(lat, lon, s, e)
    monkeypatch.setattr(openmeteo, "fetch_forecast", spy)
    engine.forecast_spot("hauraki_gulf", start=START, days=1)
    engine.forecast_spot("dunedin", start=START, days=1)
    engine.forecast_spot("central_otago_lakes", start=START, days=1)
    assert seen[0] == (-36.7, 175.0, "sea") and seen[1] == (-45.917, 170.539, "sea")
    assert seen[2][2] == "land"


def test_fallback_to_model_tides(patched, monkeypatch):
    def boom(*a, **k):
        raise IOError("LINZ down")
    monkeypatch.setattr(tides, "fetch_linz", boom)
    fc = engine.forecast_spot("dunedin", start=START, days=1)
    assert fc["tide_source"].startswith("Open-Meteo") and any("LINZ" in w for w in fc["warnings"])
    assert fc["tide_datum"] == "msl" and all(t["datum"] == "msl" for t in fc["tides"])


def test_lake_has_no_tides_or_sea(patched):
    fc = engine.forecast_spot("central_otago_lakes", start=START, days=1)
    assert contract.validate_v1(fc) == []
    assert fc["tide_source"] is None and fc["tides"] == [] and fc["tide_datum"] is None
    assert "sea" not in fc["days"][0]["best_window"]["advice"]
    assert all(h["swell_m"] is None and h["tide_m"] is None for h in fc["hourly"])


def test_forecast_many_isolates_errors(patched):
    out = engine.forecast_many(["dunedin", "nope"], start=START, days=1)
    assert "days" in out["dunedin"] and "error" in out["nope"]


def test_poor_day_says_no_good_window(patched, monkeypatch):
    def windy(*a, **k):
        d = fake_forecast(*a, **k)
        d["hourly"]["wind_speed_10m"] = [32] * 48
        d["hourly"]["wind_gusts_10m"] = [45] * 48
        return d
    monkeypatch.setattr(openmeteo, "fetch_forecast", windy)
    fc = engine.forecast_spot("dunedin", start=START, days=1)
    bw = fc["days"][0]["best_window"]
    assert bw["advice"].startswith("No good window") and bw["rating"] == "poor"
    assert fc["verdict"]["rating"] == "poor" and fc["verdict"]["headline"].startswith("Not worth it")
    assert len(fc["windows"]) == 1   # extra windows need >= marginal
