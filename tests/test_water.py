"""Water lines (2.6.0): sea temperature with its trend, and a current line
estimated from LINZ tides; plain wording, no dashes, raw numbers kept."""
import os
import sys
from datetime import date, datetime, timedelta

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import make_sample  # noqa: E402

from fishon_engine import contract, water  # noqa: E402
from fishon_engine import tides  # noqa: E402
from fishon_engine.tides import TideEvent  # noqa: E402
from fishon_engine.tz import NZ  # noqa: E402

NOTES = ("water_temp_note", "current_note", "water_note")


@pytest.fixture(scope="module")
def samples():
    return {fc["spot"]["id"]: fc for fc in
            [make_sample.build(sid) for sid in make_sample.SPOTS] + [make_sample.build_boi()]}


def test_water_note_present(samples):
    for sid in ("hauraki_gulf", "bay_of_islands", "dunedin"):
        fc = samples[sid]
        assert any("estimated from LINZ" in s for s in fc["sources"])
        for w in fc["windows"]:
            assert w["water_temp_note"] and w["current_note"], (sid, w["id"])
            assert w["water_note"] == f"{w['water_temp_note']} {w['current_note']}"
            assert w["water"]["sst_c"] is not None and w["water"]["sst_trend"] in ("warming", "cooling", "steady")
            assert w["water"]["current"]["next_turn"]["type"] in ("high", "low")
        v = fc["verdict"]
        best = next(w for w in fc["windows"] if w["id"] == v["window"]["id"])
        assert v["water_note"] == best["water_note"] and v["current_note"] == best["current_note"]
    # snapper and kingfish thresholds come through in the north
    assert "snapper and kingfish" in samples["hauraki_gulf"]["verdict"]["water_temp_note"]
    # freshwater: no water lines at all
    lakes = samples["central_otago_lakes"]
    assert lakes["verdict"]["water_note"] is None
    assert all(w["water_note"] is None and w["water"] is None for w in lakes["windows"])


def test_water_lines_have_no_dashes_or_knots(samples):
    lines = []
    for fc in samples.values():
        assert contract.validate_v1(fc) == []
        for o in fc["windows"] + [fc["verdict"]]:
            lines += [o[k] for k in NOTES if o.get(k)]
    assert len(lines) > 60
    for t in lines:
        assert "\u2014" not in t and "\u2013" not in t and " - " not in t, t
        assert "knot" not in t.lower() and "thermocline" not in t.lower(), t
    bad = dict(samples["hauraki_gulf"])
    bad["windows"] = [dict(bad["windows"][0], water_temp_note="Water's 17\u00b0 \u2014 warm",
                           water_note="Water's 17\u00b0 \u2014 warm " + bad["windows"][0]["current_note"])]
    assert any("water_temp_note" in e for e in contract.validate_v1(bad))


def test_temp_note_meaning_first():
    assert water.temp_note(17.2, 0.1, ["Snapper", "Kingfish"]) == \
        "Warm enough for snapper and kingfish, water's 17° and steady."
    assert water.temp_note(15.4, -0.6, ["Snapper", "Kingfish"]) == \
        "A bit cold for kingfish, water's 15.4° and cooling. Fine for snapper."
    assert water.temp_note(12.0, 0.8, ["Snapper", "Kingfish"]).startswith("Too cold for snapper and kingfish")
    assert water.temp_note(12.3, None, ["Blue Cod"]) == "Water's 12°."
    assert water.temp_note(None, None, ["Snapper"]) is None


def test_sst_trend_from_real_history(samples):
    # Dunedin's recorded 23 to 25 Oct sea temperatures are part of the trend
    hist = make_sample._load("dunedin_sst_history.json", make_sample.FIX)
    assert len(hist["hourly"]["sea_surface_temperature"]) == 72
    d = water.daily_sst([{"time": datetime(2026, 10, 23, 12, tzinfo=NZ), "sst_c": 12.0},
                         {"time": datetime(2026, 10, 26, 12, tzinfo=NZ), "sst_c": 12.5}])
    assert water.sst_trend(d, date(2026, 10, 26)) == 0.5
    assert water.sst_trend(d, date(2026, 10, 27)) is None


def _ev(h, kind, height):
    return TideEvent(datetime(2026, 10, 28, 0, tzinfo=NZ) + timedelta(hours=h), height, kind, "LINZ")


def test_current_estimate_and_wording():
    ev = [_ev(0, "low", 0.5), _ev(6.2, "high", 2.9), _ev(12.4, "low", 0.5), _ev(18.6, "high", 2.9),
          _ev(24.8, "low", 0.5)]
    med = water.median_rate(ev)

    def hrs(h0, n):
        out = []
        for i in range(n):
            t = ev[0].time + timedelta(hours=h0 + i)
            out.append({"time": t, "tide": tides.state_at(ev, t + timedelta(minutes=30))})
        return out
    mid = water.current(hrs(2, 3), med)
    assert 0.9 <= mid["flow_index_avg"] <= 1.0 and mid["turn"] is None
    assert water.current_note(mid).startswith("Steady run")
    turn = water.current(hrs(5, 3), med)
    assert turn["turn"]["type"] == "high"
    assert "quiet at slack water" in water.current_note(turn)
    # no LINZ (or a spot we don't trust): no current line
    w = water.window_water(hrs(2, 3), {}, ["Snapper"], med, current_ok=False)
    assert w["current_note"] is None and w["water"]["current"] is None
    assert {"wellington", "marlborough_sounds"} <= water.NO_CURRENT_SPOTS
