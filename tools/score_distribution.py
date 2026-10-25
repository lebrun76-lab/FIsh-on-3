"""Score calibration check: engine 2.0 setup vs engine 2.1 setup, live data.

  python tools/score_distribution.py [--days 7] [--out docs/scoring/score_distribution_YYYY-MM-DD.json]

"2.0" = region-centre coordinates, Open-Meteo default cell_selection=land,
WEIGHTS_V20.  "2.1" = sea weather points (spots.WX_POINTS), cell_selection=sea,
WEIGHTS. "2.1-points+2.0-weights" isolates the effect of the new points. Starts tomorrow (NZ) so every day is a full day. Uses the engine's
HTTP cache, so a re-run within the TTL makes no new requests.
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import statistics
import sys
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fishon_engine import engine, openmeteo, scoring, spots  # noqa: E402
from fishon_engine.tz import today_nz  # noqa: E402


def pct(xs, q):
    xs = sorted(xs)
    if not xs:
        return None
    k = (len(xs) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return round(xs[lo] + (xs[hi] - xs[lo]) * (k - lo), 2)


def stats(xs):
    return {"n": len(xs), "min": pct(xs, 0), "p10": pct(xs, .1), "p25": pct(xs, .25), "median": pct(xs, .5),
            "p75": pct(xs, .75), "p90": pct(xs, .9), "max": pct(xs, 1),
            "mean": round(statistics.mean(xs), 2) if xs else None,
            "share_ge_8": round(sum(x >= 8 for x in xs) / len(xs), 3) if xs else None,
            "share_ge_7_5": round(sum(x >= 7.5 for x in xs) / len(xs), 3) if xs else None,
            "share_ge_6": round(sum(x >= 6 for x in xs) / len(xs), 3) if xs else None,
            "share_lt_4_5": round(sum(x < 4.5 for x in xs) / len(xs), 3) if xs else None}


def run(setup, ids, start, days, runs):
    orig_get, orig_ff, orig_w = engine.get_spot, openmeteo.fetch_forecast, scoring.WEIGHTS
    if setup == "2.0":
        engine.get_spot = lambda sid: dataclasses.replace(orig_get(sid), wx_lat=None, wx_lon=None)
        openmeteo.fetch_forecast = lambda *a, cell_selection="land", **k: orig_ff(*a, cell_selection="land", **k)
        scoring.WEIGHTS = scoring.WEIGHTS_V20
    elif setup == "2.1-points+2.0-weights":
        scoring.WEIGHTS = scoring.WEIGHTS_V20
    try:
        hours, best, day, per_spot = [], [], [], {}
        for sid in ids:
            fc = engine.forecast_spot(sid, start=start, days=days, model_runs={})
            hs = [h["score"] for h in fc["hourly"] if h["light"] in ("day", "change of light")]
            bs = [d["best_window"]["score"] for d in fc["days"] if d["best_window"]]
            ds = [d["score"] for d in fc["days"] if d["score"] is not None]
            gr = [h["gust_kn"] / h["wind_kn"] for h in fc["hourly"] if h["wind_kn"] and h["wind_kn"] >= 5 and h["gust_kn"]]
            hours += hs; best += bs; day += ds
            per_spot[sid] = {"best_window_median": pct(bs, .5), "best_window_max": pct(bs, 1),
                             "day_median": pct(ds, .5), "gust_ratio_median": pct(gr, .5),
                             "wind_kn_mean": round(statistics.mean([h["wind_kn"] for h in fc["hourly"] if h["wind_kn"] is not None]), 1)}
        return {"daylight_hours": stats(hours), "best_window_per_day": stats(best), "day_score": stats(day),
                "per_spot": per_spot}
    finally:
        engine.get_spot, openmeteo.fetch_forecast, scoring.WEIGHTS = orig_get, orig_ff, orig_w


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--out")
    a = ap.parse_args(argv)
    start = today_nz() + timedelta(days=1)
    ids = [s.id for s in spots.SPOTS.values() if s.is_coastal]
    res = {"start": start.isoformat(), "days": a.days, "spots": ids,
           "setups": {k: run(k, ids, start, a.days, {}) for k in ("2.0", "2.1-points+2.0-weights", "2.1")}}
    js = json.dumps(res, indent=1)
    if a.out:
        os.makedirs(os.path.dirname(a.out), exist_ok=True)
        with open(a.out, "w") as f:
            f.write(js + "\n")
    for k, v in res["setups"].items():
        print(k)
        for m in ("daylight_hours", "best_window_per_day", "day_score"):
            print(f"  {m:22s}", {x: v[m][x] for x in ("n", "p10", "p25", "median", "p75", "p90", "max", "share_ge_8", "share_ge_7_5", "share_lt_4_5")})


if __name__ == "__main__":
    main()
