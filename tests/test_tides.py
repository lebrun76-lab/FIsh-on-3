import math
import os
from datetime import datetime, timedelta

from conftest import FIX
from fishon_engine import tides
from fishon_engine.tz import NZ


def _events():
    with open(os.path.join(FIX, "linz_port_chalmers_2026_excerpt.csv"), encoding="utf-8") as f:
        return tides.parse_linz_csv(f.read())


def test_parse_counts_and_alternates():
    ev = _events()
    assert len(ev) == 8 * 4 - 1 + 8 * 4 - 1   # each excerpt month has one 3-event day
    for a, b in zip(ev, ev[1:]):
        if (b.time - a.time) < timedelta(hours=9):
            assert a.kind != b.kind
    assert ev[0].kind == "high" and ev[0].height == 2.1


def test_times_are_local_with_dst():
    ev = _events()
    sat = [e for e in ev if e.time.date().isoformat() == "2026-04-04"][0]
    mon = [e for e in ev if e.time.date().isoformat() == "2026-04-06"][0]
    assert sat.time.utcoffset() == timedelta(hours=13)   # NZDT before 5 Apr 2026
    assert mon.time.utcoffset() == timedelta(hours=12)   # NZST after
    oct25 = [e for e in ev if e.time.date().isoformat() == "2026-10-25"]
    assert oct25[0].time.strftime("%H:%M") == "03:08" and oct25[0].kind == "high"


def test_height_and_state():
    ev = _events()
    t = datetime(2026, 10, 25, 6, 14, tzinfo=NZ)       # half way 03:08 high -> 09:20 low
    h = tides.height_at(ev, t)
    assert 1.1 < h < 1.2
    st = tides.state_at(ev, t)
    assert st["phase"] == "falling" and st["next"].kind == "low"


def test_url_quotes_macrons():
    assert tides.linz_url("Kaikōura", 2026).endswith("/Kaik%C5%8Dura%202026.csv")
    assert "Halfmoon%20Bay%20-%20Oban%202026" in tides.linz_url("Halfmoon Bay - Oban", 2026)


def test_extremes_from_series_and_compare():
    t0 = datetime(2026, 10, 26, 0, tzinfo=NZ)
    times = [t0 + timedelta(hours=i) for i in range(48)]
    period = 12.42
    peak = 3.3  # hours
    hs = [math.cos(2 * math.pi * (i - peak) / period) for i in range(48)]
    ex = tides.extremes_from_series(times, hs)
    highs = [e for e in ex if e.kind == "high"]
    assert abs((highs[0].time - (t0 + timedelta(hours=peak))).total_seconds()) < 15 * 60
    linz = [tides.TideEvent(e.time + timedelta(minutes=30), e.height, e.kind, "LINZ") for e in ex]
    c = tides.compare(linz, ex)
    assert c["matched"] == len(ex) and abs(c["mean_offset_min"] + 30) < 0.5
