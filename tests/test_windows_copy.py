"""Windows (every separate window >= 4.5, near_best), today's remaining-
daylight score, valid_until, LINZ display names and the copy rules (no em
dash or spaced dash; time ranges use an unspaced en dash; Salt Supply Co brand).
All offline: Bay of Islands replays tests/fixtures/real_2026-10-26_boi."""
import json
import os
import sys
from datetime import datetime, timedelta

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import make_sample  # noqa: E402

import fishon_engine  # noqa: E402
from fishon_engine import cache, contract, scoring, spots, tideports, tz  # noqa: E402
from fishon_engine.tz import NZ  # noqa: E402

D = datetime(2026, 10, 31, 0, tzinfo=NZ)
SUN = {"sunrise": D.replace(hour=6), "sunset": D.replace(hour=20)}


def _hours(scores):
    return [{"time": D + timedelta(hours=h), "score": s, "light": "day"} for h, s in scores.items()]


def test_every_separate_window_over_bar_is_kept():
    # best ~9 at dawn, ~6 midday, ~5 at dusk: the old rule (within 1.5 of the
    # best) kept only the dawn one.
    sc = {h: 2.0 for h in range(5, 22)}
    sc.update({6: 9, 7: 9, 8: 9, 12: 6, 13: 6, 14: 6, 18: 5, 19: 5, 20: 5})
    w = scoring.windows(_hours(sc), SUN)
    assert [(x[0]["time"].hour, x[-1]["time"].hour) for x in w] == [(6, 8), (12, 14), (18, 20)]


def test_below_bar_and_first_is_best_even_if_poor():
    sc = {h: 2.0 for h in range(5, 22)}
    sc.update({9: 3, 10: 3, 11: 3})
    w = scoring.windows(_hours(sc), SUN)
    assert len(w) == 1 and w[0][0]["time"].hour == 9


def test_merge_touching():
    h = _hours({h: 6.0 for h in range(6, 15)})
    a, b, c = h[0:3], h[3:6], h[7:9]           # 6-8, 9-11 touch; 13-14 apart
    m = scoring.merge_touching([b, c, a])
    assert [(x[0]["time"].hour, x[-1]["time"].hour) for x in m] == [(6, 11), (13, 14)]
    assert scoring.merge_touching([h[0:4], h[2:5]])[0][-1]["time"].hour == 10   # overlap


@pytest.fixture(scope="module")
def boi():
    return {"early": make_sample.build_boi(make_sample.BOI_EARLY), "live": make_sample.build_boi()}


def _today(fc):
    return [(w["headline"], w["score"], w["near_best"]) for w in fc["windows"] if w["date"] == "2026-10-26"]


def test_boi_26_oct_windows(boi):
    # whole day: 5-8am is best; 10am-1pm and 6-9pm clear 4.5 but are > 1.5 below
    assert _today(boi["early"]) == [("Mon 5\u20138am looks great", 8.8, True),
                                    ("Mon 10am\u20131pm looks good", 6.6, False),
                                    ("Mon 6\u20139pm looks good", 6.4, False)]
    assert boi["early"]["verdict"]["headline"] == "Go Monday early morning"
    assert boi["early"]["verdict"]["score"] == 8.8


def test_boi_remaining_daylight(boi):
    d0 = boi["early"]["days"][0]
    assert d0["score"] == d0["score_remaining"] == d0["score_full_day"] == 8.0
    d0 = boi["live"]["days"][0]   # clock 08:48: 5-8am has gone
    assert d0["score"] == d0["score_remaining"] == 7.0 and d0["score_full_day"] == 8.0
    assert d0["remaining_from"] == "2026-10-26T08:00:00+13:00"
    for d in boi["live"]["days"][1:]:
        assert d["score_remaining"] is None and d["remaining_from"] is None
        assert d["score_full_day"] == d["score"]


def test_boi_contract_and_sample(boi):
    assert contract.validate_v1(boi["live"]) == []
    with open(os.path.join(make_sample.OUT, "v1_bay_of_islands_2026-10-26_0848.json"), encoding="utf-8") as f:
        assert json.load(f) == json.loads(json.dumps(boi["live"])), "run tools/make_sample.py"


# --- copy -----------------------------------------------------------------

def _strings(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k != "tide_port_linz_name":      # raw LINZ name, kept as LINZ writes it
                yield from _strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from _strings(v)
    elif isinstance(o, str):
        yield o


def _bad(s):
    return "\u2014" in s or " \u2013 " in s or " - " in s


def _outputs(boi):
    outs = [make_sample.build(sid) for sid in make_sample.SPOTS] + list(boi.values())
    return outs


def test_no_dashes_in_generated_text(boi):
    bad = sorted({s for fc in _outputs(boi) for s in _strings(fc) if _bad(s)})
    assert bad == []
    with open(os.path.join(make_sample.OUT, "cli_2026-10-26.txt"), encoding="utf-8") as f:
        lines = [ln.strip() for ln in f if not ln.startswith("#")]
    # a leading "- " is a list bullet, not a dash in a sentence
    assert [ln for ln in lines if _bad(ln[2:] if ln.startswith("- ") else ln)] == []


def test_brand():
    assert cache.UA["User-Agent"].startswith("SaltSupplyCo")
    for fn in ("README.md", "pyproject.toml", "app.py"):
        with open(os.path.join(ROOT, fn), encoding="utf-8") as f:
            t = f.read()
        assert "Fish on!" not in t and "Fish On " not in t and "Salt Supply Co" in t


def test_time_ranges_use_unspaced_en_dash(boi):
    a = datetime(2026, 10, 26, 8, tzinfo=NZ)
    assert tz.fmt_range(a, a.replace(hour=11)) == "Mon 8\u201311am"
    assert tz.fmt_range(a.replace(hour=10), a.replace(hour=13)) == "Mon 10am\u20131pm"
    d0 = boi["live"]["days"][0]
    assert "Best: Mon 8\u201311am" in d0["summary"]
    assert not any(" - " in s or "-am" in s for s in _strings(boi["live"]))
    for w in boi["live"]["windows"]:
        assert "\u2013" in w["headline"] and "-" not in w["headline"]


def test_valid_until_is_end_of_current_hour(boi):
    assert boi["live"]["generated_at"].startswith("2026-10-26T08:48")
    assert boi["live"]["valid_until"] == "2026-10-26T09:00:00+13:00"
    assert boi["early"]["valid_until"] == "2026-10-26T01:00:00+13:00"
    for sid in make_sample.SPOTS:
        fc = make_sample.build(sid)
        assert fc["valid_until"] == "2026-10-26T01:00:00+13:00"


def test_engine_version_2_3_0(boi):
    assert fishon_engine.__version__ == "2.3.0"
    assert boi["live"]["engine_version"] == "2.3.0"
    for fn in os.listdir(make_sample.OUT):
        if fn.endswith(".json"):
            with open(os.path.join(make_sample.OUT, fn), encoding="utf-8") as f:
                fc = json.load(f)
            if "engine_version" in fc and "valid_until" in fc:
                assert fc["engine_version"] == "2.3.0", fn


def test_linz_display_names():
    dn = tideports.display_name
    assert dn("Lottin Point - Wakatiri") == "Lottin Point (Wakatiri)"
    assert dn("Coromandel Harbour - Whanganui Island") == "Coromandel Harbour (Whanganui Island)"
    assert dn("Te Whanganui / Port Underwood - Ocean Bay") == "Te Whanganui / Port Underwood (Ocean Bay)"
    assert dn("Russell") == "Russell" and dn(None) is None
    # raw names still resolve; every port label and spot text is clean
    assert tideports.find_daily("Lottin Point - Wakatiri").file == "Lottin Point - Wakatiri"
    co = spots.get_spot("coromandel")
    assert co.tide_port == "Coromandel Harbour (Whanganui Island)"
    assert co.tide_port_linz_name == "Coromandel Harbour - Whanganui Island"
    assert " - " not in co.tide_note
    p = tideports.get_port(co.tide_port_id)
    assert p.label == "LINZ secondary port Coromandel Harbour (Whanganui Island) (offsets from Auckland)"
    for s in spots.SPOTS.values():
        assert s.tide_port is None or " - " not in s.tide_port
        assert " - " not in s.tide_note
