"""windows[].id (2.4.0): present, unique within an output, and stable across
runs. The id is built from spot id + window start + window end only, so a
later run with a different score or clock gives the same id for the same
window. All offline (recorded fixtures and synthetic data)."""
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import make_sample  # noqa: E402

import fishon_engine  # noqa: E402
from fishon_engine import contract, engine, scoring  # noqa: E402

from test_engine_offline import START, patched  # noqa: E402,F401


def _all_window_objs(fc):
    out = list(fc["windows"])
    for d in fc["days"]:
        out += [w for w in (d["best_window"], d["least_bad_window"]) if w]
    v = fc["verdict"]
    out += [w for w in (v["window"], v["best_later"], v["least_bad"]) if w]
    return out


@pytest.fixture(scope="module")
def samples():
    return [make_sample.build(sid) for sid in make_sample.SPOTS] + [make_sample.build_boi()]


def test_id_present_and_format(samples):
    for fc in samples:
        sid = fc["spot"]["id"]
        for w in _all_window_objs(fc):
            assert w["id"] == f"{sid}:{w['start']}/{w['end']}"
        assert contract.validate_v1(fc) == []
    hg = samples[0]
    assert hg["windows"][0]["id"] == "hauraki_gulf:2026-10-26T05:00:00+13:00/2026-10-26T08:00:00+13:00"


def test_id_unique_within_output(samples):
    for fc in samples:
        ids = [w["id"] for w in fc["windows"]]
        assert ids and len(ids) == len(set(ids))


def test_engine_version_top_level(samples):
    for fc in samples:
        assert fc["engine_version"] == fishon_engine.__version__ == "2.6.0"


def test_id_stable_when_score_changes(patched, monkeypatch):  # noqa: F811
    a = engine.forecast_spot("dunedin", start=START, days=2)
    real = scoring.summarise

    def lower(*args, **kw):
        s = real(*args, **kw)
        return dict(s, score=round(s["score"] - 0.7, 1))
    monkeypatch.setattr(scoring, "summarise", lower)
    b = engine.forecast_spot("dunedin", start=START, days=2)
    wa = {w["id"]: w for w in a["windows"]}
    wb = {w["id"]: w for w in b["windows"] if w["id"] in wa}
    assert wb, "no window in common"
    for i, w in wb.items():
        assert (w["start"], w["end"]) == (wa[i]["start"], wa[i]["end"])
        assert w["score"] != wa[i]["score"]


def test_id_stable_across_run_times():
    # Bay of Islands replayed at 00:54 and 08:48: the 6-9pm window is in both
    early, live = make_sample.build_boi(make_sample.BOI_EARLY), make_sample.build_boi()
    assert early["generated_at"] != live["generated_at"]
    e = {(w["start"], w["end"]): w["id"] for w in early["windows"]}
    shared = [(w["start"], w["end"], w["id"]) for w in live["windows"] if (w["start"], w["end"]) in e]
    assert shared
    for s, en, i in shared:
        assert e[(s, en)] == i


def test_validator_flags_bad_ids(samples):
    fc = dict(samples[0], windows=[dict(w) for w in samples[0]["windows"]])
    fc["windows"][1]["id"] = fc["windows"][0]["id"]
    errs = contract.validate_v1(fc)
    assert any("duplicate" in e for e in errs) and any("windows[1].id" in e for e in errs)
    del fc["windows"][0]["id"]
    assert "windows[0].id: missing" in contract.validate_v1(fc)


def test_target_species_matches_advice(samples):
    for fc in samples:
        for w in fc["windows"]:
            if w["target_species"]:
                assert f"Try {w['target_species'].lower()}" in w["advice"]
            else:
                assert "Try " not in w["advice"]
    # 2.5.0: the target is the top species-scored one when there is one
    for fc in samples:
        for w in fc["windows"]:
            if w["species"]:
                assert w["target_species"] == w["species"][0]["name"]
    assert samples[0]["windows"][0]["target_species"] == samples[0]["windows"][0]["species"][0]["name"]
