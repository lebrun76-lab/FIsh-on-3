"""End-to-end with no network: synthetic Open-Meteo JSON + real LINZ excerpt."""
import json
import math
import os
from datetime import date, datetime, timedelta

import pytest

from conftest import FIX
from fishon_engine import engine, openmeteo, tides
from fishon_engine.cache import Cache
from fishon_engine.tz import NZ, UTC

START = date(2026, 10, 27)


def _hours(n=48):
    t0 = datetime.combine(START, datetime.min.time(), NZ)
    return [int((t0 + timedelta(hours=i)).timestamp()) for i in range(n)]


def fake_forecast(lat, lon, s, e, cache=None):
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
    assert fc["timezone"] == "Pacific/Auckland" and fc["tide_source"].startswith("LINZ")
    assert len(fc["days"]) == 2
    d0 = fc["days"][0]
    assert d0["date"] == "2026-10-27" and d0["sunrise"].endswith("+13:00")
    assert len(d0["blocks_3h"]) == 8 and d0["sst_c"] == 12.8
    bw = d0["best_window"]
    assert bw["start"].startswith("2026-10-27T") and "offshore" in bw["text"]
    assert [t["kind"] for t in d0["tides"]][:2] == ["high", "low"]
    assert fc["tide_comparison"]["matched"] > 0
    json.dumps(fc, default=str)


def test_fallback_to_model_tides(patched, monkeypatch):
    def boom(*a, **k):
        raise IOError("LINZ down")
    monkeypatch.setattr(tides, "fetch_linz", boom)
    fc = engine.forecast_spot("dunedin", start=START, days=1)
    assert fc["tide_source"].startswith("Open-Meteo") and any("LINZ" in w for w in fc["warnings"])


def test_lake_has_no_tides_or_sea(patched):
    fc = engine.forecast_spot("central_otago_lakes", start=START, days=1)
    assert fc["tide_source"] is None and fc["days"][0]["tides"] == []
    assert "sea" not in fc["days"][0]["best_window"]["text"]


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
    assert fc["days"][0]["best_window"]["text"].startswith("No good window")
