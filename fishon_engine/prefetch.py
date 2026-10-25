"""Warm the cache for every spot (run from cron, e.g. every 30-60 min).

    python -m fishon_engine.prefetch            # all spots, 7 days
    python -m fishon_engine.prefetch --days 10 moeraki bluff

Each spot costs 1 forecast call + 1 marine call (coastal) per refresh, plus a
LINZ download once per port per year (cached 30 days). 23 spots refreshed
hourly is about 23*2*24*30 = ~33k Open-Meteo calls/month - well inside the
1M/month API Standard plan.
"""
from __future__ import annotations

import argparse
import time

from .cache import default_cache
from .engine import forecast_spot
from .spots import SPOTS


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("spots", nargs="*")
    ap.add_argument("--days", type=int, default=7)
    a = ap.parse_args(argv)
    ids = a.spots or list(SPOTS)
    t0, fails = time.time(), 0
    for sid in ids:
        try:
            forecast_spot(sid, days=a.days)
        except Exception as exc:
            fails += 1
            print(f"FAIL {sid}: {exc}")
    c = default_cache()
    print(f"prefetched {len(ids) - fails}/{len(ids)} spots in {time.time() - t0:.1f}s; cache {c.stats}; db {c.path}")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
