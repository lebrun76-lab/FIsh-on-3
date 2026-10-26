"""Species scoring (2.5.0): per-species window scores capped at the window's
safety-gated score, in-season species only, a source for every factor, and
plain verdict lines. All offline (recorded samples and synthetic hours)."""
import os
import sys
from datetime import date, datetime, timedelta

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import make_sample  # noqa: E402

from fishon_engine import contract, species, species_scoring as ss  # noqa: E402
from fishon_engine.spots import get_spot  # noqa: E402
from fishon_engine.tides import TideEvent  # noqa: E402
from fishon_engine.tz import NZ  # noqa: E402

D = datetime(2026, 10, 28, 0, tzinfo=NZ)
KINDS = {"sst_min", "tide_running", "light_change", "daylight", "sea_max"}


@pytest.fixture(scope="module")
def samples():
    return [make_sample.build(sid) for sid in make_sample.SPOTS] + [make_sample.build_boi()]


def _tide(t, prev_h, next_h):
    return {"phase": "rising", "prev": TideEvent(t - timedelta(hours=prev_h), "low", 0.5, "x"),
            "next": TideEvent(t + timedelta(hours=next_h), "high", 2.5, "x"),
            "hours_since_prev": prev_h, "hours_to_next": next_h}


def _hours(start_h, n, *, light="day", sst=17.0, sea=0.3, tide=(3.0, 3.0)):
    out = []
    for i in range(n):
        t = D + timedelta(hours=start_h + i)
        out.append({"time": t, "score": 6.0, "light": light, "sst_c": sst, "sea_m": sea,
                    "tide": _tide(t, *tide) if tide else None})
    return out


def _open(spot_id, d):
    return species.species_for(get_spot(spot_id), d, 17.0)


def test_species_score_never_above_window_score(samples):
    n = 0
    for fc in samples:
        for w in fc["windows"]:
            for sp in w["species"]:
                assert 0 <= sp["score"] <= w["score"], (w["id"], sp)
                n += 1
            if w["species"]:
                assert w["target_species"] == w["species"][0]["name"]
                sc = [x["score"] for x in w["species"]]
                assert sc == sorted(sc, reverse=True)
    assert n > 50
    # worst case: every factor missed on a low window still clamps to [0, window]
    hrs = _hours(1, 3, light="dark", sst=10.0, sea=3.0, tide=(0.2, 6.0))
    for name in ss.conditions():
        r = ss.score_species(name, hrs, 0.4)
        assert 0 <= r["score"] <= 0.4
    for name in ss.conditions():
        assert ss.score_species(name, _hours(5, 3, light="change of light"), 7.3)["score"] <= 7.3


def test_out_of_season_species_never_appear(samples):
    hrs = _hours(9, 3)
    # Marlborough Sounds blue cod is closed 1 Sep to 10 Jan
    names = [x["name"] for x in ss.score_window(hrs, 6.0, _open("marlborough_sounds", date(2026, 10, 28)))]
    assert "Blue Cod" not in names
    names = [x["name"] for x in ss.score_window(hrs, 6.0, _open("marlborough_sounds", date(2027, 2, 1)))]
    assert "Blue Cod" in names
    # Cook Strait kingfish is sourced for Dec to Feb only: off-peak in October
    names = [x["name"] for x in ss.score_window(hrs, 6.0, _open("wellington", date(2026, 10, 28)))]
    assert "Kingfish" not in names
    names = [x["name"] for x in ss.score_window(hrs, 6.0, _open("wellington", date(2027, 1, 15)))]
    assert "Kingfish" in names
    # every species in the real samples is open on that window's date
    for fc in samples:
        sp = get_spot(fc["spot"]["id"])
        for w in fc["windows"]:
            st = {x["name"]: x["status"] for x in species.species_for(sp, date.fromisoformat(w["date"]), 17.0)}
            for x in w["species"]:
                assert st[x["name"]] in ss.OPEN_STATUSES
                assert x["name"] in sp.species


def test_every_factor_used_has_a_source():
    cond = ss.conditions()
    for name in ("Snapper", "Kingfish", "Kahawai", "Gurnard", "Tarakihi", "Blue Cod"):
        assert cond[name]["factors"], name
    for name, e in cond.items():
        for f in e["factors"]:
            assert f["factor"] in KINDS, (name, f)
            assert f.get("claim"), (name, f["factor"])
            assert f.get("sources") and all("http" in s for s in f["sources"]), (name, f["factor"])
            assert 0 < f["penalty"] <= 1.0
        for x in e.get("left_out", []):
            assert x.get("factor") and x.get("reason")
    assert all(srcs for per in ss.factor_sources().values() for srcs in per.values())
    # unsourced species (tuna) are not scored
    assert not {"Southern Bluefin Tuna", "Pacific Bluefin Tuna", "Albacore"} & set(cond)


def test_verdict_text_has_no_em_dash(samples):
    lines = []
    for fc in samples:
        lines += [d["species_verdict"] for d in fc["days"] if d["species_verdict"]]
        if fc["verdict"]["species_text"]:
            lines.append(fc["verdict"]["species_text"])
        for w in fc["windows"]:
            lines += [x["why"] for x in w["species"]]
    assert len(lines) > 20
    for t in lines:
        assert "\u2014" not in t and " \u2013 " not in t and " - " not in t, t
    days = [d["species_verdict"] for fc in samples for d in fc["days"] if d["species_verdict"]]
    assert all("\u2013" in t and t.endswith(".") for t in days)


def test_best_by_species_points_at_that_species_best_window(samples):
    for fc in samples:
        assert contract.validate_v1(fc) == []
        by_id = {w["id"]: w for w in fc["windows"]}
        for d in fc["days"]:
            day_w = [w for w in fc["windows"] if w["date"] == d["date"]]
            for name, wid in d["best_by_species"].items():
                top = max(x["score"] for w in day_w for x in w["species"] if x["name"] == name)
                got = next(x["score"] for x in by_id[wid]["species"] if x["name"] == name)
                assert got == top and by_id[wid]["date"] == d["date"]
        for wid in fc["verdict"]["best_by_species"].values():
            assert wid in by_id
    hg = samples[0]
    assert hg["days"][0]["species_verdict"].endswith("Mon 5\u20138am.")
    lakes = samples[2]
    assert lakes["spot"]["id"] == "central_otago_lakes"
    assert all(w["species"] == [] for w in lakes["windows"]) and lakes["verdict"]["species_text"] is None


def test_factor_rules():
    # snapper: slack tide and no change of light cost points
    run = ss.score_species("Snapper", _hours(5, 3, light="change of light"), 7.0)
    assert run["score"] == 7.0 and "tide running" in run["why"] and "dawn" in run["why"]
    slack = ss.score_species("Snapper", _hours(11, 3, tide=(0.3, 6.0)), 7.0)
    assert slack["score"] == 5.8 and "slack tide" in slack["why"] and "no dawn or dusk" in slack["why"]
    cool = ss.score_species("Snapper", _hours(5, 3, light="change of light", sst=14.0), 7.0)
    assert cool["score"] == 6.5 and "cool for snapper" in cool["why"]
    # kingfish below 16 C
    assert ss.score_species("Kingfish", _hours(5, 3, light="change of light", sst=15.0), 7.0)["score"] == 6.2
    # gurnard and white water
    assert ss.score_species("Gurnard", _hours(17, 3, light="change of light", sea=1.4), 7.0)["score"] == 6.0
    # blue cod don't feed in the dark; tide is not scored for blue cod
    assert ss.score_species("Blue Cod", _hours(1, 3, light="dark", tide=(0.2, 6.0)), 5.0)["score"] == 4.0
    assert ss.score_species("Blue Cod", _hours(10, 3, tide=(0.2, 6.0)), 5.0)["score"] == 5.0
    # missing data costs nothing
    r = ss.score_species("Tarakihi", _hours(10, 3, tide=None), 5.0)
    assert r["score"] == 5.0 and r["why"] == "no tide data"


def test_verdict_line_groups_species_sharing_a_window():
    w1 = {"id": "x:a", "start": "2026-10-31T06:00:00+13:00", "end": "2026-10-31T09:00:00+13:00",
          "confidence": "high", "species": [{"name": "Snapper", "score": 7.0, "why": ""},
                                            {"name": "Kahawai", "score": 6.8, "why": ""}]}
    w2 = {"id": "x:b", "start": "2026-11-01T05:00:00+13:00", "end": "2026-11-01T08:00:00+13:00",
          "confidence": "high", "species": [{"name": "Kingfish", "score": 7.5, "why": ""},
                                            {"name": "Snapper", "score": 4.0, "why": ""}]}
    best = ss.best_by_species([w1, w2])
    assert best == {"Kingfish": "x:b", "Snapper": "x:a", "Kahawai": "x:a"}
    assert ss.verdict_line(best, [w1, w2]) == "Kingfish: Sun 5\u20138am. Snapper and kahawai: Sat 6\u20139am."
    assert ss.verdict_line({}, []) is None
