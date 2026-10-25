"""CLI: python -m fishon_engine moeraki bluff hauraki_gulf [--days 3] [--json]"""
from __future__ import annotations

import argparse
import json

from .engine import forecast_spot


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("spots", nargs="+")
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--blocks", action="store_true", help="print 3-hour blocks")
    a = ap.parse_args(argv)
    for sid in a.spots:
        fc = forecast_spot(sid, days=a.days, compare_tides=True)
        if a.json:
            print(json.dumps(fc, indent=1, default=str))
            continue
        s = fc["spot"]
        print(f"=== {s['name']} ({s['region']}) - shore faces {s['facing_deg']} deg; tides: {fc['tide_source']}")
        for d in fc["days"]:
            bw = d["best_window"]
            print(f"  {d["label"]}: {"-" if d["score"] is None else d["score"]}/10 {d['verdict']} [{d['confidence']} confidence]"
                  f" | SST {d['sst_c']} C | {d['moon']['phase']} {d['moon']['illumination_pct']}%")
            if bw:
                print(f"    Best: {bw['text']}  ({bw['score']}/10)")
            if d["tides"]:
                print("    Tides: " + "; ".join(f"{t['kind']} {t['time'][11:16]} {t['height_m']} m" for t in d["tides"]))
            top = [f"{x['name']} ({x['status']})" for x in d["species"][:4]]
            print("    Species: " + ", ".join(top))
            closed = [x for x in d["species"] if x["status"] == "closed"]
            for x in closed:
                print(f"    CLOSED: {x['name']} - {x['notes'][0]}")
            if a.blocks:
                for b in d["blocks_3h"]:
                    print(f"      {b['label']:>10} {b['score']:>4} wind {b['wind_from']} {b['wind_kn']} kn ({b['wind_rel']}) sea {b['sea_m']} m @{b['swell_period_s']}s rain {b['rain_mm']}")
        if fc.get("tide_comparison"):
            print(f"  LINZ vs Open-Meteo tide check: {fc['tide_comparison']}")
        for w in fc["warnings"]:
            print(f"  note: {w}")
        print(f"  cache: {fc['cache']}")


if __name__ == "__main__":
    main()
