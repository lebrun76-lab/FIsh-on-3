"""Regenerate docs/samples/*.json from the recorded real responses in
tests/fixtures/real_2026-10-26d (Open-Meteo forecast, marine and wind/wave
model-comparison responses fetched 2026-10-26 00:54 NZDT for 26 Oct - 1 Nov by
tools/record_fixtures.py, LINZ 2026 CSV excerpts, Open-Meteo model metadata). Fully offline and deterministic: the clock is frozen at the
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

FIX = os.path.join(ROOT, "tests", "fixtures", "real_2026-10-26d")
OUT = os.path.join(ROOT, "docs", "samples")
with open(os.path.join(FIX, "RECORDED.json")) as _f:
    NOW = datetime.fromisoformat(json.load(_f)["recorded_at"]).astimezone(NZ)
START, DAYS = date(2026, 10, 26), 7
SPOTS = ["hauraki_gulf", "dunedin", "central_otago_lakes"]
LINZ = {"Mātiatia Bay": "linz_Mātiatia_Bay_2026_oct-nov.csv", "Green Island": "linz_Green_Island_2026_oct-nov.csv",
        "Marsden Point": "linz_Marsden_Point_2026_oct-nov.csv"}
# Bay of Islands, recorded 2026-10-26 08:48 NZDT for the window before/after
# check (docs/WINDOWS.md); its 26 Oct rows start at 00:00, so the earlier hours
# are Open-Meteo's analysis of what already happened.
BOI_FIX = os.path.join(ROOT, "tests", "fixtures", "real_2026-10-26_boi")


def _load(name, fix=None):
    with open(os.path.join(fix or FIX, name), encoding="utf-8") as f:
        return json.load(f)


def recorded_at(fix):
    with open(os.path.join(fix, "RECORDED.json")) as f:
        return datetime.fromisoformat(json.load(f)["recorded_at"]).astimezone(NZ)


@contextmanager
def recorded(fix=None, spots=None, now=None):
    fix, spots, now = fix or FIX, spots or SPOTS, now or NOW

    def ld(name):  # this replay's fixture dir
        return _load(name, fix)
    by_point = {}
    for sid in spots:
        sp = engine.get_spot(sid)
        by_point[("f", round(sp.forecast_lat, 3), round(sp.forecast_lon, 3))] = f"{sid}_forecast.json"
        if sp.is_coastal:
            by_point[("m", round(sp.marine_lat, 3), round(sp.marine_lon, 3))] = f"{sid}_marine.json"

    def ff(lat, lon, s, e, cache=None, cell_selection="land"):
        d = ld(by_point[("f", round(lat, 3), round(lon, 3))])
        d["_cache"] = {"cache": "fixture"}
        return d

    def fm(lat, lon, s, e, cache=None):
        d = ld(by_point[("m", round(lat, 3), round(lon, 3))])
        d["_cache"] = {"cache": "fixture"}
        return d

    def fw(lat, lon, s, e, cache=None, cell_selection="land"):
        k = by_point[("f", round(lat, 3), round(lon, 3))].replace("_forecast", "_wind_models")
        return dict(ld(k), _cache={"cache": "fixture"})

    def fv(lat, lon, s, e, cache=None):
        k = by_point[("m", round(lat, 3), round(lon, 3))].replace("_marine", "_wave_models")
        return dict(ld(k), _cache={"cache": "fixture"})

    def fh(lat, lon, s, cache=None):
        # 2.6.0 SST history; fixtures recorded before 2.6.0 have none (no trend)
        k = by_point[("m", round(lat, 3), round(lon, 3))].replace("_marine", "_sst_history")
        if not os.path.exists(os.path.join(fix, k)):
            return {"hourly": {}}
        return dict(ld(k), _cache={"cache": "fixture"})

    def fl(port, s, e, cache=None):
        with open(os.path.join(fix, LINZ[port]), encoding="utf-8") as f:
            return tides.parse_linz_csv(f.read())

    saved = (openmeteo.fetch_forecast, openmeteo.fetch_marine, tides.fetch_linz,
             engine.now_nz, engine.today_nz, openmeteo.fetch_model_runs,
             openmeteo.fetch_wind_models, openmeteo.fetch_wave_models, openmeteo.fetch_sst_history)
    openmeteo.fetch_sst_history = fh
    openmeteo.fetch_forecast, openmeteo.fetch_marine, tides.fetch_linz = ff, fm, fl
    openmeteo.fetch_wind_models, openmeteo.fetch_wave_models = fw, fv
    openmeteo.fetch_model_runs = lambda cache=None: ld("model_runs.json")
    engine.now_nz, engine.today_nz = (lambda: now), (lambda: now.date())
    try:
        yield
    finally:
        (openmeteo.fetch_forecast, openmeteo.fetch_marine, tides.fetch_linz,
         engine.now_nz, engine.today_nz, openmeteo.fetch_model_runs,
         openmeteo.fetch_wind_models, openmeteo.fetch_wave_models, openmeteo.fetch_sst_history) = saved


def build(sid):
    with recorded():
        return engine.forecast_spot(sid, start=START, days=DAYS, model_runs=_load("model_runs.json"))


BOI_EARLY = datetime(2026, 10, 26, 0, 54, tzinfo=NZ)   # same clock as the other samples


def build_boi(now=None):
    """Bay of Islands from its own 08:48 NZDT recording. ``now`` defaults to
    the recording time (so today's past hours drop out, as live); pass
    BOI_EARLY to see the whole of 26 Oct."""
    now = now or recorded_at(BOI_FIX)
    with recorded(BOI_FIX, ["bay_of_islands"], now):
        return engine.forecast_spot("bay_of_islands", start=START, days=DAYS,
                                    model_runs=_load("model_runs.json", BOI_FIX))


def main():
    os.makedirs(OUT, exist_ok=True)
    fc = build_boi()
    path = os.path.join(OUT, "v1_bay_of_islands_2026-10-26_0848.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(fc, f, indent=1, ensure_ascii=False, allow_nan=False)
        f.write("\n")
    print(path, fc["verdict"]["headline"], fc["verdict"]["score"])
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
                f"# offline replay of the data recorded {NOW:%Y-%m-%d %H:%M} NZDT (tools/make_sample.py)\n")
        f.write(buf.getvalue())
    print(path)


if __name__ == "__main__":
    main()
