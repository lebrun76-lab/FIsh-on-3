"""LINZ secondary ports + nearest-port matching (offline)."""
import os
from datetime import date, datetime

from conftest import FIX
from fishon_engine import engine, openmeteo, spots, tideports as tp, tides
from fishon_engine.tz import NZ

import test_engine_offline as teo


def test_parse_diff():
    assert tp.parse_diff("+0054") == 54
    assert tp.parse_diff("-0107") == -67
    assert tp.parse_diff("0000") == 0
    assert tp.parse_diff("+ 0039") == 39
    assert tp.parse_diff("-") is None and tp.parse_diff("hhmm") is None


def test_linz_worked_example():
    # LINZ Almanac worked example: standard HW 0941 3.3 m; diff -0022,
    # secondary MSL 1.3, ratio 0.74, standard MSL 1.9 -> 0919, 2.3 m.
    port = tp.TidePort(id="sec:x", name="X", kind="secondary", lat=0, lon=0, standard="S",
                       hw_diff_min=-22, lw_diff_min=-20, msl=1.3, ratio=0.74, standard_msl=1.9)
    ev = [tides.TideEvent(datetime(2026, 1, 5, 9, 41, tzinfo=NZ), 3.3, "high", "LINZ")]
    out = tp.apply_offsets(ev, port)
    assert out[0].time == datetime(2026, 1, 5, 9, 19, tzinfo=NZ)
    assert round(out[0].height, 1) == 2.3 and out[0].kind == "high"


MINI = """Secondary ports,,,,,,,,,,,,,,,,
No.,Port,Lat,,Long,,HW,,LW,,MHWS,MHWN,MLWN,MLWS,MSL,Ratio,
,,°,´,°,´,Mean,Range,Mean,Range,,,,,,,
6000,Std Port,45,00,170,00,hhmm,hhmm to hhmm,hhmm,hhmm to hhmm,2.0,1.6,0.5,0.2,1.20,,
,Some Area,,,,,,,,,,,,,,,
6001,Sec A,45,30,170,30,+0010,-,-0005,-,1.9,1.5,0.6,0.3,1.1,0.80,
6002,Sec B,44,15,176,30W,+0020,-,-,-,-,-,-,-,-,-,*
,,,,,,,,,,,,,,,,
"""


def test_parse_mini_csv():
    ports, std = tp.parse_secondary_csv(MINI)
    assert std == {"Std Port": 1.2}
    a, b = ports
    assert (a.name, a.standard, a.area, a.hw_diff_min, a.lw_diff_min, a.msl, a.ratio, a.standard_msl) == \
        ("Sec A", "Std Port", "Some Area", 10, -5, 1.1, 0.8, 1.2)
    assert a.lat == -45.5 and a.lon == 170.5 and not a.approximate
    assert b.lon == -176.5 and b.approximate and b.lw_diff_min is None and not b.has_heights
    assert tp.suitability(b) is not None


def test_vendored_secondary_table():
    with open(tp.SECONDARY_CSV, encoding="utf-8") as f:
        raw, std = tp.parse_secondary_csv(f.read())
    assert len(std) == 15 and std["Timaru"] == 1.5 and std["Westport"] == 2.06
    by = {p.name: p for p in raw}
    m = by["Moeraki"]
    assert (m.standard, m.hw_diff_min, m.lw_diff_min, m.msl, m.ratio) == ("Timaru", -8, -7, 1.1, 0.86)
    assert by["Greymouth"].standard == "Westport" and by["Greymouth"].hw_diff_min == 6
    assert next(p for p in raw if p.id == "sec:6536").lon < 0                      # Chatham Islands, W longitude
    assert by["Haast River Entrance"].approximate
    # every standard port has a LINZ daily CSV, so nothing is dropped
    assert len(tp.secondary_ports()) == len(raw)
    assert len(tp.daily_ports()) == 87


def test_apply_offsets_on_real_excerpt():
    with open(os.path.join(FIX, "linz_port_chalmers_2026_excerpt.csv"), encoding="utf-8") as f:
        std = tides.parse_linz_csv(f.read())
    spit = next(p for p in tp.secondary_ports() if p.name == "Spit Wharf")
    out = tp.apply_offsets(std, spit)
    assert len(out) == len(std)
    for s, o in zip(std, out):
        diff = spit.hw_diff_min if s.kind == "high" else spit.lw_diff_min
        assert (o.time - s.time).total_seconds() == diff * 60 and o.kind == s.kind
        assert abs(o.height - (spit.msl + (s.height - spit.standard_msl) * spit.ratio)) < 0.006


def _p(name, kind, lat, lon, approx=False):
    extra = {} if kind == "daily" else dict(standard="S", hw_diff_min=0, lw_diff_min=0, msl=1.0,
                                             ratio=1.0, standard_msl=1.0)
    return tp.TidePort(id=f"{kind}:{name}", name=name, kind=kind, lat=lat, lon=lon,
                       approximate=approx, **extra)


def test_nearest_rules():
    # 0.01 deg lat ~ 1.11 km
    sec = _p("Sec", "secondary", -40.01, 175.0)
    daily_close = _p("DailyClose", "daily", -40.05, 175.0)    # ~4.4 km further -> preferred
    m = tp.nearest_port(-40.0, 175.0, [sec, daily_close])
    assert m.port.name == "DailyClose"
    daily_far = _p("DailyFar", "daily", -40.10, 175.0)        # ~10 km further -> not preferred
    assert tp.nearest_port(-40.0, 175.0, [sec, daily_far]).port.name == "Sec"
    # excluded site skipped and reported
    dun = _p("Dunedin", "daily", -40.001, 175.0)
    m = tp.nearest_port(-40.0, 175.0, [dun, daily_far])
    assert m.port.name == "DailyFar" and m.nearest_skipped[0].name == "Dunedin"
    # approximate data avoided while an exact port is within 30 km
    apx = _p("Apx", "secondary", -40.005, 175.0, approx=True)
    assert tp.nearest_port(-40.0, 175.0, [apx, daily_far]).port.name == "DailyFar"
    far = _p("Far", "daily", -41.0, 175.0)
    assert tp.nearest_port(-40.0, 175.0, [apx, far]).port.name == "Apx"
    # far flag
    assert tp.nearest_port(-40.0, 175.0, [far]).far


# Shore bearings must not change in this PR (Alex reviews them separately).
FACINGS = {"bay_of_islands": 45, "bay_of_plenty": 10, "coromandel": 270, "east_cape": 20, "far_north": 80,
           "hauraki_gulf": 60, "hawkes_bay": 100, "taranaki": 330, "wellington": 180,
           "banks_peninsula": 150, "bluff": 180, "catlins": 135, "dunedin": 120, "fiordland": 260,
           "greymouth": 300, "haast_jackson": 310, "kaikoura": 120, "marlborough_sounds": 30,
           "moeraki": 90, "nelson_bays": 0, "stewart_island": 80}


def test_every_coastal_spot_has_a_port_and_facings_unchanged():
    for s in spots.list_spots():
        if not s.is_coastal:
            assert s.tide_port is None
            continue
        assert s.tide_port_id and s.tide_port_km is not None
        p = tp.get_port(s.tide_port_id)
        assert p.name == s.tide_port_linz_name and p.display == s.tide_port and " - " not in s.tide_port
        if s.id in FACINGS:
            assert s.facing == FACINGS[s.id], s.id


def test_engine_uses_secondary_port(monkeypatch):
    seen = []

    def fake_linz(port, s, e, cache=None):
        seen.append(port)
        return teo.fake_linz(port, s, e, cache)

    monkeypatch.setattr(openmeteo, "fetch_forecast", teo.fake_forecast)
    monkeypatch.setattr(openmeteo, "fetch_marine", teo.fake_marine)
    monkeypatch.setattr(tides, "fetch_linz", fake_linz)
    fc = engine.forecast_spot("moeraki", start=teo.START, days=1)
    assert seen and seen[0] == "Timaru"
    assert fc["tide_source"].startswith("LINZ secondary port Moeraki")
    assert fc["spot"]["tide_port"] == "Moeraki" and fc["spot"]["tide_port_km"] < 30
    assert any("Timaru" in w for w in fc["warnings"])
