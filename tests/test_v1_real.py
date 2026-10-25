"""Offline run on real recorded data (tests/fixtures/real_2026-10-26) and
checks against the site's v1 contract plus the committed docs samples."""
import json
import os
import sys
from datetime import datetime

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import make_sample  # noqa: E402

from fishon_engine import contract, engine  # noqa: E402


@pytest.fixture(scope="module")
def out():
    return {sid: make_sample.build(sid) for sid in make_sample.SPOTS}


@pytest.mark.parametrize("sid", make_sample.SPOTS)
def test_matches_v1_contract(out, sid):
    assert contract.validate_v1(out[sid]) == []
    json.dumps(out[sid], allow_nan=False)


@pytest.mark.parametrize("sid", make_sample.SPOTS)
def test_docs_sample_is_current(out, sid):
    with open(os.path.join(make_sample.OUT, f"v1_{sid}_2026-10-26.json"), encoding="utf-8") as f:
        assert json.load(f) == json.loads(json.dumps(out[sid])), "run tools/make_sample.py"


def test_hourly_every_hour(out):
    fc = out["hauraki_gulf"]
    assert fc["hourly_step_h"] == 1 and len(fc["hourly"]) == 7 * 24
    t = [datetime.fromisoformat(h["time"]) for h in fc["hourly"]]
    assert all((b - a).total_seconds() == 3600 for a, b in zip(t, t[1:]))


def test_swell_and_wave_separate(out):
    hs = out["dunedin"]["hourly"]
    assert all(h["wave_m"] >= h["swell_m"] for h in hs)
    assert any(h["wave_m"] != h["swell_m"] for h in hs)
    d = out["dunedin"]["days"][0]
    assert d["swell_m_avg"] < d["wave_m_avg"]


def test_day_aggregates_from_daylight_hours(out):
    fc = out["dunedin"]
    d = fc["days"][0]
    sr, ss = datetime.fromisoformat(d["sunrise"]), datetime.fromisoformat(d["sunset"])
    day = [h for h in fc["hourly"] if h["time"].startswith(d["date"])]
    light = [h for h in day if sr <= datetime.fromisoformat(h["time"]) <= ss]
    assert d["gust_kn_max"] == max(h["gust_kn"] for h in light)
    assert d["wind_kn_avg"] == pytest.approx(sum(h["wind_kn"] for h in light) / len(light), abs=0.06)
    assert d["rain_mm"] == pytest.approx(sum(h["rain_mm"] for h in day), abs=0.06)


def test_text_agrees_with_rating(out):
    words = {"great": "Excellent", "good": "Good", "marginal": "Marginal", "poor": "Poor"}
    for fc in out.values():
        for d in fc["days"]:
            assert d["rating"] == engine.rating(d["score"])
            assert d["summary"].startswith(words[d["rating"]])


def test_tides_type_and_chart_datum(out):
    fc = out["hauraki_gulf"]
    assert fc["tide_source"] == "LINZ Mātiatia Bay" and fc["tide_datum"] == "chart_datum"
    assert fc["tides"][0] == {"time": "2026-10-26T01:34:00+13:00", "type": "low", "height_m": 0.7,
                              "datum": "chart_datum", "source": "LINZ"}
    types = [t["type"] for t in fc["tides"]]
    assert all(a != b for a, b in zip(types, types[1:]))


def test_model_run_and_sources(out):
    fc = out["hauraki_gulf"]
    assert fc["model_run"] == "ECMWF IFS 2026-10-25T00:00Z (latest run ingested by Open-Meteo best_match)"
    assert fc["model_runs"]["meteofrance_wave"] == "2026-10-24T12:00Z"
    assert fc["sources"][0] == "Open-Meteo (CC BY 4.0)"
    assert sum("Not for navigation" in s for s in fc["sources"]) == 1


def test_spot_block_and_species_once(out):
    fc = out["hauraki_gulf"]
    s = fc["spot"]
    assert (s["lat"], s["lon"], s["island"]) == (-36.7, 175.0, "North")
    assert s["species"][0] == "Snapper" and [x["name"] for x in fc["species"]] == s["species"]
    assert all("species" not in d for d in fc["days"])


def test_windows_multiple_per_day_and_verdict(out):
    for fc in out.values():
        by_day = {}
        for w in fc["windows"]:
            by_day.setdefault(w["date"], []).append(w)
        assert all(1 <= len(v) <= engine.MAX_WINDOWS_PER_DAY for v in by_day.values())
        for v in by_day.values():
            for a, b in zip(v, v[1:]):
                assert a["end"] <= b["start"]
            assert all(x["score"] >= 4.5 for x in v[1:])
        assert fc["verdict"]["score"] == max(w["score"] for w in fc["windows"]
                                             if w["confidence"] == fc["verdict"]["confidence"])
    assert max(len([w for w in out["dunedin"]["windows"] if w["date"] == d]) for d in
               {w["date"] for w in out["dunedin"]["windows"]}) == 3
    v = out["hauraki_gulf"]["verdict"]
    assert v["headline"] == "Go Monday early morning" and v["rating"] == "great"


def test_lake(out):
    fc = out["central_otago_lakes"]
    assert fc["tides"] == [] and fc["tide_datum"] is None and fc["spot"]["coastal"] is False
    assert all(h["swell_m"] is None and h["sst_c"] is None for h in fc["hourly"])
