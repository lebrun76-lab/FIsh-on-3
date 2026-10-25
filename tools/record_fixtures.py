"""Record the real Open-Meteo responses that tests/test_v1_real.py and
tools/make_sample.py replay offline (forecast, marine, wind/wave model
comparison, model-run metadata) into tests/fixtures/real_<stamp>/. LINZ CSV
excerpts are copied from the previous recording (they are the published 2026
tables, not a forecast). Costs ~10 Open-Meteo calls.

  python tools/record_fixtures.py                      # the three sample spots
  python tools/record_fixtures.py bay_of_islands --out tests/fixtures/real_2026-10-26_boi
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from fishon_engine import engine, openmeteo  # noqa: E402
from fishon_engine.cache import Cache  # noqa: E402
from fishon_engine.tz import now_nz  # noqa: E402

SPOTS = ["hauraki_gulf", "dunedin", "central_otago_lakes"]
DAYS = 7
OLD = os.path.join(ROOT, "tests", "fixtures", "real_2026-10-26")


def _save(d, path):
    d = {k: v for k, v in d.items() if k != "_cache"}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, separators=(",", ":"))


def main(out=None, spots=None):
    spots = spots or SPOTS
    now = now_nz()
    start = now.date()
    end = start + timedelta(days=DAYS - 1)
    out = out or os.path.join(ROOT, "tests", "fixtures", f"real_{start.isoformat()}d")
    os.makedirs(out, exist_ok=True)
    c = Cache(":memory:")
    for sid in spots:
        sp = engine.get_spot(sid)
        sel = "sea" if sp.is_coastal else "land"
        _save(openmeteo.fetch_forecast(sp.forecast_lat, sp.forecast_lon, start, end, c, cell_selection=sel),
              os.path.join(out, f"{sid}_forecast.json"))
        _save(openmeteo.fetch_wind_models(sp.forecast_lat, sp.forecast_lon, start, end, c, cell_selection=sel),
              os.path.join(out, f"{sid}_wind_models.json"))
        if sp.is_coastal:
            _save(openmeteo.fetch_marine(sp.marine_lat, sp.marine_lon, start, end, c),
                  os.path.join(out, f"{sid}_marine.json"))
            _save(openmeteo.fetch_wave_models(sp.marine_lat, sp.marine_lon, start, end, c),
                  os.path.join(out, f"{sid}_wave_models.json"))
    with open(os.path.join(out, "model_runs.json"), "w") as f:
        json.dump(openmeteo.fetch_model_runs(c), f, indent=1)
    for n in os.listdir(OLD):
        if n.startswith("linz_"):
            shutil.copy(os.path.join(OLD, n), out)
    with open(os.path.join(out, "RECORDED.json"), "w") as f:
        json.dump({"recorded_at": now.isoformat(timespec="seconds"), "start": start.isoformat(),
                   "days": DAYS, "spots": spots}, f, indent=1)
    print(out, now.isoformat(timespec="seconds"))


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("spots", nargs="*")
    ap.add_argument("--out")
    a = ap.parse_args()
    main(a.out and os.path.join(ROOT, a.out) if a.out and not os.path.isabs(a.out) else a.out, a.spots or None)
