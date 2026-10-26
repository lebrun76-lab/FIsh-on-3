"""Tides: LINZ official predictions first, Open-Meteo modelled sea level as fallback.

LINZ (Land Information New Zealand) publishes yearly high/low tide predictions
for NZ standard ports as CSV:
  https://static.charts.linz.govt.nz/tide-tables/maj-ports/csv/<Port> <YEAR>.csv
  (listed at https://www.linz.govt.nz/products-services/tides-and-tidal-streams/tide-predictions)
Licence: CC BY 4.0 -- attribution "Contains data sourced from Land Information
New Zealand (LINZ), licensed for reuse under CC BY 4.0". LINZ notes these
predictions are not official tide tables for the purposes of Maritime Rules
Part 25 (navigation), and do not include weather effects (storm surge, wind set-up).

CSV layout (verified 2026-10-25):
  line 1  "<no>,<Port>,<lat>,<lon>"   (UTF-8 BOM)
  line 2  "Based on constituent set with reference date:,..."
  line 3  "Local Std or Daylight Time,Tidal heights in metres."
  rows    day,weekday,month,year,HH:MM,height[,HH:MM,height]... (up to 4 pairs)
Times are NZ local clock time (already NZST/NZDT). Heights are metres above
chart datum. Highs and lows are not labelled; we infer them from neighbours.

Open-Meteo ``sea_level_height_msl`` is a ~8 km (0.08 deg) numerical model,
relative to global MSL (not chart datum). Open-Meteo itself warns accuracy is
limited near coasts and it is not for navigation. We only use it where no
LINZ port is mapped, and we label it as "modelled".
"""
from __future__ import annotations

import csv
import io
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional
from urllib.parse import quote

from .cache import Cache, default_cache, http_get_text
from .tz import NZ

LINZ_URL = "https://static.charts.linz.govt.nz/tide-tables/maj-ports/csv/{name}.csv"
LINZ_TTL = 30 * 86400
LINZ_ATTRIBUTION = ("Tide predictions: Land Information New Zealand (LINZ), CC BY 4.0. "
                    "Not for navigation.")


@dataclass(frozen=True)
class TideEvent:
    time: datetime          # aware, Pacific/Auckland
    height: float           # m (LINZ: above chart datum; Open-Meteo: vs global MSL)
    kind: str               # "high" | "low"
    source: str             # "LINZ" | "Open-Meteo (modelled)"


def linz_url(port: str, year: int) -> str:
    return LINZ_URL.format(name=quote(f"{port} {year}"))


def parse_linz_csv(text: str, source: str = "LINZ") -> List[TideEvent]:
    text = text.lstrip("\ufeff")
    pts = []
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 6 or not row[0].strip().isdigit():
            continue
        try:
            d, m, y = int(row[0]), int(row[2]), int(row[3])
        except ValueError:
            continue
        cells = row[4:]
        for i in range(0, len(cells) - 1, 2):
            t, h = cells[i].strip(), cells[i + 1].strip()
            if not t or not h:
                continue
            hh, mm = (int(x) for x in t.split(":"))
            # fold=0 -> on the April DST change an ambiguous 2:xx am is read as NZDT
            pts.append((datetime(y, m, d, hh, mm, tzinfo=NZ), float(h)))
    pts.sort(key=lambda p: p[0])
    return _label(pts, source)


def _label(pts, source) -> List[TideEvent]:
    out = []
    for i, (t, h) in enumerate(pts):
        nb = [pts[j][1] for j in (i - 1, i + 1) if 0 <= j < len(pts)]
        if not nb:
            continue
        kind = "high" if h > sum(nb) / len(nb) else "low"
        out.append(TideEvent(t, h, kind, source))
    return out


def fetch_linz(port: str, start: date, end: date, cache: Optional[Cache] = None) -> List[TideEvent]:
    cache = cache or default_cache()
    events: List[TideEvent] = []
    for year in range(start.year, end.year + 1):
        body, _ = cache.fetch(linz_url(port, year), None, LINZ_TTL, http_get_text)
        events.extend(parse_linz_csv(body))
    lo = datetime.combine(start, datetime.min.time(), NZ) - timedelta(hours=13)
    hi = datetime.combine(end, datetime.min.time(), NZ) + timedelta(hours=37)
    return [e for e in events if lo <= e.time <= hi]


def extremes_from_series(times: List[datetime], heights: List[Optional[float]],
                         source: str = "Open-Meteo (modelled)") -> List[TideEvent]:
    """Find highs/lows in an hourly sea-level series, refining each turning
    point with a parabola through the three surrounding hours."""
    out = []
    for i in range(1, len(heights) - 1):
        a, b, c = heights[i - 1], heights[i], heights[i + 1]
        if a is None or b is None or c is None:
            continue
        if (b > a and b >= c) or (b < a and b <= c):
            denom = a - 2 * b + c
            off = 0.5 * (a - c) / denom if denom else 0.0
            off = max(-0.5, min(0.5, off))
            h = b - 0.25 * (a - c) * off
            t = times[i] + timedelta(hours=off)
            out.append(TideEvent(t, round(h, 2), "high" if b > a else "low", source))
    return out


def height_at(events: List[TideEvent], t: datetime) -> Optional[float]:
    """Cosine interpolation between successive extremes."""
    for a, b in zip(events, events[1:]):
        if a.time <= t <= b.time:
            frac = (t - a.time) / (b.time - a.time)
            return a.height + (b.height - a.height) * (1 - math.cos(math.pi * frac)) / 2
    return None


def state_at(events: List[TideEvent], t: datetime) -> Optional[Dict]:
    """Return {'phase': 'rising'|'falling', 'prev': TideEvent, 'next': TideEvent,
    'hours_to_next': float, 'hours_since_prev': float} or None if outside data."""
    for a, b in zip(events, events[1:]):
        if a.time <= t < b.time:
            return {"phase": "rising" if b.kind == "high" else "falling", "prev": a, "next": b,
                    "hours_to_next": (b.time - t).total_seconds() / 3600,
                    "hours_since_prev": (t - a.time).total_seconds() / 3600}
    return None


def compare(linz: List[TideEvent], model: List[TideEvent], max_gap_h: float = 3.0) -> Dict:
    """Match each LINZ high/low to the nearest modelled one of the same kind.
    Returns timing differences (model minus LINZ, minutes) and tidal ranges."""
    diffs = []
    for e in linz:
        same = [m for m in model if m.kind == e.kind]
        if not same:
            continue
        m = min(same, key=lambda x: abs((x.time - e.time).total_seconds()))
        dt = (m.time - e.time).total_seconds() / 60
        if abs(dt) <= max_gap_h * 60:
            diffs.append(dt)

    def rng(ev):
        hs = [x.height for x in ev]
        return round(max(hs) - min(hs), 2) if hs else None

    return {
        "matched": len(diffs),
        "mean_offset_min": round(sum(diffs) / len(diffs), 1) if diffs else None,
        "max_abs_offset_min": round(max(abs(d) for d in diffs), 1) if diffs else None,
        "linz_range_m": rng(linz), "model_range_m": rng(model),
    }
