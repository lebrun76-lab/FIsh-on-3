"""Check the LINZ offset method against sites that LINZ publishes BOTH as a
daily-prediction CSV and as a secondary port (needs network).

    .venv/bin/python tools/validate_secondary.py 2026-10-26 2026-11-08
"""
import statistics as st
import sys
import os
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fishon_engine import tideports as tp  # noqa: E402


def main(s: date, e: date):
    daily = {p.name: p for p in tp.daily_ports()}
    print(f"| Site | Standard port | HW/LW diff (min) | Events matched | Time error mean / max abs (min) | Height error mean / max abs (m) |")
    print("|---|---|---|---|---|---|")
    for sp in tp.secondary_ports():
        d = daily.get(sp.name)
        if not d or tp.suitability(sp):
            continue
        a, b = tp.fetch_events(d, s, e), tp.fetch_events(sp, s, e)
        dts, dhs = [], []
        for x in a:
            cands = [y for y in b if y.kind == x.kind]
            if not cands:
                continue
            y = min(cands, key=lambda y: abs((y.time - x.time).total_seconds()))
            if abs((y.time - x.time).total_seconds()) < 4 * 3600:
                dts.append((y.time - x.time).total_seconds() / 60)
                dhs.append(y.height - x.height)
        if dts:
            print(f"| {sp.name} | {sp.standard} | {sp.hw_diff_min:+d} / {sp.lw_diff_min:+d} | {len(dts)} | "
                  f"{st.mean(dts):+.0f} / {max(map(abs, dts)):.0f} | {st.mean(dhs):+.2f} / {max(map(abs, dhs)):.2f} |")


if __name__ == "__main__":
    a = sys.argv[1:] or ["2026-10-26", "2026-11-08"]
    main(date.fromisoformat(a[0]), date.fromisoformat(a[1]))
