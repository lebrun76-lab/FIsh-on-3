"""Print the spot -> LINZ port table (before = engine v2 hand-picked port, after = nearest suitable).

    .venv/bin/python tools/tide_port_table.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fishon_engine import spots, tideports as tp  # noqa: E402


def main():
    print("| Spot | Before (v2) | km | After | Type | km | Flags |")
    print("|---|---|---|---|---|---|---|")
    for s in spots.list_spots():
        if not s.is_coastal:
            continue
        if s.legacy_tide_port:
            b = tp.find_daily(s.legacy_tide_port)
            bkm = f"{tp.haversine_km(s.lat, s.lon, b.lat, b.lon):.1f}"
            before = s.legacy_tide_port
        else:
            before, bkm = "none (Open-Meteo model)", "–"
        m = tp.nearest_port(s.lat, s.lon)
        p = m.port
        kind = "daily" if p.kind == "daily" else f"secondary of {p.standard} (HW {p.hw_diff_min:+d}, LW {p.lw_diff_min:+d} min)"
        flags = []
        if m.far:
            flags.append(f">{tp.FAR_KM:g} km")
        if p.approximate:
            flags.append("LINZ approximate")
        if m.nearest_skipped:
            q, d, why = m.nearest_skipped
            flags.append(f"skipped closer {q.name} ({d:g} km: {why})")
        print(f"| {s.id} | {before} | {bkm} | {p.name} | {kind} | {m.km:.1f} | {'; '.join(flags) or '–'} |")
    lakes = [s.id for s in spots.list_spots() if not s.is_coastal]
    print(f"\nLakes (no tides): {', '.join(lakes)}")


if __name__ == "__main__":
    main()
