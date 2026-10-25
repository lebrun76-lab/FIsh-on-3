from datetime import datetime, timedelta

from fishon_engine import confidence
from fishon_engine.tz import NZ

T0 = datetime(2026, 10, 27, 8, tzinfo=NZ)


def _win(n=3, wind=8.0, gust=12.0, wave=0.6):
    return [{"time": T0 + timedelta(hours=i), "score": 6.1, "wind_kn": wind, "gust_kn": gust,
             "wave_m": wave, "swell_m": 0.5} for i in range(n)]


def _rows(win):
    return {h["time"]: {"time": h["time"], "wind_speed_10m": 8, "wind_gusts_10m": 12,
                        "wind_direction_10m": 270, "wave_height": 0.6} for h in win}


def _rescore(r):   # toy: 10 - wind/3 - 2*wave
    return {"score": round(10 - r["wind_speed_10m"] / 3 - 2 * r["wave_height"], 1)}


def _series(win, **v):
    return {h["time"]: dict(v) for h in win}


def test_agreeing_models_keep_lead_level():
    w = _win()
    wm = {m: _series(w, wind_speed_10m=8.5, wind_gusts_10m=12, wind_direction_10m=270) for m in "abc"}
    cd = confidence.window_confidence(w, _rows(w), 1, _rescore, True, wm, {})
    assert cd["level"] == "high" and cd["agreement"] == "good" and cd["downgrades"] == []


def test_disagreement_downgrades_per_band_width():
    w = _win()
    wm = {"a": _series(w, wind_speed_10m=8, wind_gusts_10m=12, wind_direction_10m=270),
          "b": _series(w, wind_speed_10m=14, wind_gusts_10m=20, wind_direction_10m=270)}  # -2.0 pts
    cd = confidence.window_confidence(w, _rows(w), 1, _rescore, True, wm, {})
    assert cd["score_spread"] >= 1.5 and cd["level"] == "medium" and cd["agreement"] == "poor"
    wm["b"] = _series(w, wind_speed_10m=20, wind_gusts_10m=28, wind_direction_10m=270)    # -4.0 pts
    cd = confidence.window_confidence(w, _rows(w), 1, _rescore, True, wm, {})
    assert cd["level"] == "low"


def test_one_model_or_missing_hours_is_unknown():
    w = _win()
    s = _series(w, wind_speed_10m=20, wind_gusts_10m=28, wind_direction_10m=270)
    s[w[1]["time"]]["wind_speed_10m"] = None
    wm = {"a": _series(w, wind_speed_10m=8, wind_gusts_10m=12, wind_direction_10m=270), "b": s}
    cd = confidence.window_confidence(w, _rows(w), 4, _rescore, False, wm, {})
    assert cd["agreement"] == "unknown" and cd["models_missing"] == ["b"] and cd["level"] == "medium"


def test_data_gap_downgrades_one_level():
    w = _win()
    w[0]["gust_kn"] = None
    cd = confidence.window_confidence(w, _rows(w), 0, _rescore, True, {}, {})
    assert cd["gap_hours"] == 1 and cd["level"] == "medium"
    w = _win(wave=None)
    for h in w:
        h["swell_m"] = None
    assert confidence.window_confidence(w, _rows(w), 0, _rescore, True, {}, {})["level"] == "medium"
    assert confidence.window_confidence(w, _rows(w), 0, _rescore, False, {}, {})["level"] == "high"


def test_never_below_low():
    w = _win()
    w[0]["gust_kn"] = None
    wm = {"a": _series(w, wind_speed_10m=2, wind_gusts_10m=4, wind_direction_10m=270),
          "b": _series(w, wind_speed_10m=26, wind_gusts_10m=34, wind_direction_10m=270)}
    cd = confidence.window_confidence(w, _rows(w), 8, _rescore, True, wm, {})
    assert cd["level"] == "low" and len(cd["downgrades"]) == 2
