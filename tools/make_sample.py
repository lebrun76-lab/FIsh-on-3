"""Regenerate docs/samples/*.json from the recorded real responses in
tests/fixtures/real_2026-10-26 (Open-Meteo forecast + marine fetched
2026-10-26 00:11 NZDT for 26 Oct - 1 Nov, LINZ 2026 CSV excerpts, Open-Meteo
model metadata). Fully offline and deterministic: the clock is frozen at the
recording time. tests/test_v1_real.py checks the committed samples match.

  python tools/make_sample.py
"""
from __future__ import annotations

import json
import os
import sys
from contextlib import contextmanager
from datetime import date, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from fishon_engine import engine, openmeteo, tides  # noqa: E402
from fishon_engine.tz import NZ  # noqa: E402

FIX = os.path.join(ROOT, "tests", "fixtures", "real_2026-10-26")
OUT = os.path.join(ROOT, "docs", "samples")
NOW = datetime(2026, 10, 26, 0, 11, tzinfo=NZ)
START, DAYS = date(2026, 10, 26), 7
SPOTS = ["hauraki_gulf", "dunedin", "central_otago_lakes"]
LINZ = {"Mātiatia Bay": "linz_Mātiatia_Bay_2026_oct-nov.csv", "Green Island": "linz_Green_Island_2026_oct-nov.csv"}


def _load(name):
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        return json.load(f)


@contextmanager
def recorded():
    by_point = {}
    for sid in SPOTS:
        sp = engine.get_spot(sid)
        by_point[("f", round(sp.forecast_lat, 3), round(sp.forecast_lon, 3))] = f"{sid}_forecast.json"
        if sp.is_coastal:
            by_point[("m", round(sp.marine_lat, 3), round(sp.marine_lon, 3))] = f"{sid}_marine.json"

    def ff(lat, lon, s, e, cache=None, cell_selection="land"):
        d = _load(by_point[("f", round(lat, 3), round(lon, 3))])
        d["_cache"] = {"cache": "fixture"}
        return d

    def fm(lat, lon, s, e, cache=None):
        d = _load(by_point[("m", round(lat, 3), round(lon, 3))])
        d["_cache"] = {"cache": "fixture"}
        return d

    def fl(port, s, e, cache=None):
        with open(os.path.join(FIX, LINZ[port]), encoding="utf-8") as f:
            return tides.parse_linz_csv(f.read())

    saved = (openmeteo.fetch_forecast, openmeteo.fetch_marine, tides.fetch_linz,
             engine.now_nz, engine.today_nz, openmeteo.fetch_model_runs)
    openmeteo.fetch_forecast, openmeteo.fetch_marine, tides.fetch_linz = ff, fm, fl
    openmeteo.fetch_model_runs = lambda cache=None: _load("model_runs.json")
    engine.now_nz, engine.today_nz = (lambda: NOW), (lambda: NOW.date())
    try:
        yield
    finally:
        (openmeteo.fetch_forecast, openmeteo.fetch_marine, tides.fetch_linz,
         engine.now_nz, engine.today_nz, openmeteo.fetch_model_runs) = saved


def build(sid):
    with recorded():
        return engine.forecast_spot(sid, start=START, days=DAYS, model_runs=_load("model_runs.json"))


def main():
    os.makedirs(OUT, exist_ok=True)
    for sid in SPOTS:
        fc = build(sid)
        path = os.path.join(OUT, f"v1_{sid}_2026-10-26.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(fc, f, indent=1, ensure_ascii=False, allow_nan=False)
            f.write("\n")
        print(path, fc["verdict"]["headline"], fc["verdict"]["score"])
    # the same data through the CLI's text view
    import io
    from contextlib import redirect_stdout
    from fishon_engine.__main__ import main as cli
    buf = io.StringIO()
    with recorded(), redirect_stdout(buf):
        cli(SPOTS + ["--days", "3"])
    path = os.path.join(OUT, "cli_2026-10-26.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write("# python -m fishon_engine hauraki_gulf dunedin central_otago_lakes --days 3\n"
                "# offline replay of the data recorded 2026-10-26 00:11 NZDT (tools/make_sample.py)\n")
        f.write(buf.getvalue())
    print(path)


if __name__ == "__main__":
    main()
