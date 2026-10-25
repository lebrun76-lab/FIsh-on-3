"""CLI: python -m fishon_engine moeraki bluff hauraki_gulf [--days 3] [--json] [--hourly]"""
from __future__ import annotations

import argparse
import json

from .engine import forecast_many


def main(argv=None):
    ap = argparse.ArgumentParser(prog="fishon-forecast")
    ap.add_argument("spots", nargs="+")
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--json", action="store_true", help="print the v1 SpotForecast JSON")
    ap.add_argument("--hourly", action="store_true", help="print hourly rows")
    a = ap.parse_args(argv)
    out = forecast_many(a.spots, days=a.days, compare_tides=True)
    for sid, fc in out.items():
        if "error" in fc:
            print(f"=== {sid}: ERROR {fc['error']}")
            continue
        if a.json:
            print(json.dumps(fc, indent=1, ensure_ascii=False))
            continue
        s, v = fc["spot"], fc["verdict"]
        fp = s["forecast_point"]
        print(f"=== {s['name']} ({s['region']}, {s['island']}) - shore faces {s['facing_deg']} deg")
        print(f"  weather point {fp['lat']}, {fp['lon']} (cell {fp['model_cell']}); model run {fc['model_run']}")
        print(f"  tides: {fc['tide_source']} [datum: {fc['tide_datum']}]")
        print(f"  VERDICT: {v['headline']} - {v['rating']} {v['score']}/10 [{v['confidence']}]")
        print(f"    {v['advice']}")
        for d in fc["days"]:
            print(f"  {d['label']}: {'-' if d['score'] is None else d['score']}/10 {d['rating']} "
                  f"[{d['confidence']}] wind avg {d['wind_kn_avg']} kn, gust max {d['gust_kn_max']} kn, "
                  f"wave {d['wave_m_avg']} m, swell {d['swell_m_avg']} m, rain {d['rain_mm']} mm, SST {d['sst_c_avg']} C")
            print(f"    {d['summary']}")
            for w in [w for w in fc["windows"] if w["date"] == d["date"]]:
                print(f"    - {w['headline']} ({w['score']}/10): {w['advice']}")
            tl = [t for t in fc["tides"] if t["time"][:10] == d["date"]]
            if tl:
                print("    Tides: " + "; ".join(f"{t['type']} {t['time'][11:16]} {t['height_m']} m" for t in tl))
            if a.hourly:
                for h in [h for h in fc["hourly"] if h["time"][:10] == d["date"]]:
                    print(f"      {h['time'][11:16]} {h['score']:>4} wind {h['wind_kn']} g{h['gust_kn']} kn "
                          f"wave {h['wave_m']} swell {h['swell_m']} @{h['swell_period_s']}s tide {h['tide_m']} rain {h['rain_mm']}")
        sp = [f"{x['name']} ({x['status']})" for x in fc["species"][:5]]
        print("  Species: " + ", ".join(sp))
        for x in fc["species"]:
            if x["status"] == "closed":
                print(f"  CLOSED: {x['name']} - {x['notes'][0]}")
        if fc.get("tide_comparison"):
            print(f"  LINZ vs Open-Meteo tide check: {fc['tide_comparison']}")
        for w in fc["warnings"]:
            print(f"  note: {w}")


if __name__ == "__main__":
    main()
