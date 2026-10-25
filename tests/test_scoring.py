from datetime import datetime, timedelta

from fishon_engine import scoring
from fishon_engine.tz import NZ

D = datetime(2026, 10, 31, 0, tzinfo=NZ)
SUN = {"sunrise": D.replace(hour=6, minute=10), "sunset": D.replace(hour=20, minute=5)}


def hour(h, ws=5, wd=270, g=8, sea=0.5, per=8, rain=0.0):
    return {"time": D + timedelta(hours=h), "wind_speed_10m": ws, "wind_direction_10m": wd,
            "wind_gusts_10m": g, "wave_height": sea, "swell_wave_height": sea,
            "swell_wave_period": per, "precipitation": rain, "pressure_3h": 0.0}


def test_offshore_beats_onshore_and_big_swell():
    kw = dict(coastal=True, facing=90, sun=SUN)
    good = scoring.score_hour(hour(10, ws=8, wd=270), **kw)["score"]
    onshore = scoring.score_hour(hour(10, ws=14, wd=90), **kw)["score"]
    surge = scoring.score_hour(hour(10, ws=8, wd=270, sea=2.0, per=14), **kw)["score"]
    assert good > onshore and good > surge
    assert 0 <= onshore <= 10


def test_score_clamped_and_lake_ignores_sea():
    s = scoring.score_hour(hour(10, ws=40, g=50, sea=5, rain=10), coastal=True, facing=90, sun=SUN)
    assert s["score"] == 0.0
    lake = scoring.score_hour(hour(10, sea=5), coastal=False, facing=None, sun=SUN)
    assert lake["wind_rel"] is None and lake["score"] > 5


def test_best_window_and_text():
    rows = [hour(h, ws=20 if h < 12 else 4, wd=270) for h in range(24)]
    hrs = [scoring.score_hour(r, coastal=True, facing=90, sun=SUN) for r in rows]
    w = scoring.best_window(hrs, SUN)
    assert w[0]["time"].hour >= 12 and 3 <= len(w) <= 5
    summ = scoring.summarise(w, 90, True)
    txt = scoring.window_text(summ, w, True, {"name": "Blue Cod", "how": "off the rocks"})
    assert txt.startswith("Sat ") and "W" in txt and "try blue cod: off the rocks" in txt


def test_not_before_excludes_past():
    rows = [hour(h) for h in range(24)]
    hrs = [scoring.score_hour(r, coastal=True, facing=90, sun=SUN) for r in rows]
    w = scoring.best_window(hrs, SUN, not_before=D.replace(hour=15))
    assert w[0]["time"].hour >= 14


def test_blocks_3h():
    hrs = [scoring.score_hour(hour(h), coastal=True, facing=90, sun=SUN) for h in range(24)]
    b = scoring.blocks_3h(hrs, 90, True)
    assert len(b) == 8 and b[2]["label"] == "6am-9am" and b[0]["wind_rel"] == "offshore"
