"""Rebuild fishon_engine/data/linz_daily_ports.json (needs network).

For every LINZ "Daily Predictions" site in tools/linz_daily_sites.txt, download
the <year> CSV and read the position from line 1, e.g.
``034,Timaru,44°23'S,171°15'E``. File names use " - " where the list view shows
" / " (verified: all 87 returned HTTP 200 on 2026-10-25).

    .venv/bin/python tools/build_linz_catalog.py [--year 2026]
"""
import argparse
import json
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from fishon_engine.tides import linz_url  # noqa: E402
from fishon_engine.cache import http_get_text  # noqa: E402

DMS = re.compile(r"(\d+)°\s*([\d.]+)'?\s*([NSEW])")


def parse_pos(s: str) -> float:
    m = DMS.search(s)
    if not m:
        raise ValueError(f"bad position {s!r}")
    v = int(m.group(1)) + float(m.group(2)) / 60
    return -v if m.group(3) in "SW" else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2026)
    a = ap.parse_args()
    names = [l.strip() for l in open(os.path.join(ROOT, "tools", "linz_daily_sites.txt"), encoding="utf-8")
             if l.strip() and not l.startswith("#")]
    out = []
    for n in names:
        file = n.replace(" / ", " - ")
        body = http_get_text(linz_url(file, a.year))
        first = body.lstrip("\ufeff").splitlines()[0].split(",")
        out.append({"name": n, "file": file, "linz_no": first[0].strip(), "csv_name": first[1].strip(),
                    "lat": round(parse_pos(first[2]), 4), "lon": round(parse_pos(first[3]), 4)})
        time.sleep(0.2)
    meta = {"source": "https://static.charts.linz.govt.nz/tide-tables/maj-ports/csv/<file> <year>.csv line 1; "
                      "site list from https://www.linz.govt.nz/products-services/tides-and-tidal-streams/"
                      "tide-predictions/tide-predictions-list-view",
            "licence": "CC BY 4.0, Land Information New Zealand (LINZ)", "year_checked": a.year,
            "built": time.strftime("%Y-%m-%d")}
    path = os.path.join(ROOT, "fishon_engine", "data", "linz_daily_ports.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "ports": out}, f, ensure_ascii=False, indent=1)
    print(f"wrote {len(out)} ports to {path}")


if __name__ == "__main__":
    main()
