"""LINZ tide ports: daily-prediction sites + secondary ports, and nearest-port matching.

Two kinds of LINZ port are used:

* **daily** -- sites with a yearly high/low prediction CSV
  (https://static.charts.linz.govt.nz/tide-tables/maj-ports/csv/<file> <year>.csv).
  Catalogue: ``data/linz_daily_ports.json`` (positions read from each CSV's
  header line by ``tools/build_linz_catalog.py``).
* **secondary** -- ports LINZ publishes only as time/height differences from a
  standard port, in the NZ Nautical Almanac secondary-ports table
  (``data/linz_secondary_ports_2026-27.csv``, downloaded unchanged from
  https://www.linz.govt.nz/sites/default/files/2026-06/NZNA_Secondary-ports-2026-27.csv,
  linked from https://www.linz.govt.nz/products-services/tides-and-tidal-streams/tide-predictions).

LINZ method (Almanac, "Find times and heights of high and low waters",
https://www.linz.govt.nz/sites/default/files/2026-06/hydro_202627-almanac_find-times-heights-OF-high-low-waters_pdf.pdf):

    secondary time   = standard time + mean HW (or LW) time difference
    secondary height = secondary MSL + (standard height - standard MSL) x range ratio

Heights are metres above the *secondary port's* chart datum. LINZ marks some
rows ``*`` "Data Approximate"; we carry that flag through. Data CC BY 4.0, LINZ.
Not for navigation (LINZ: not official tide tables for Maritime Rules Part 25).
"""
from __future__ import annotations

import csv
import json
import math
import os
import re
from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache
from typing import Dict, List, Optional, Tuple

from . import tides

DATA = os.path.join(os.path.dirname(__file__), "data")
DAILY_JSON = os.path.join(DATA, "linz_daily_ports.json")
SECONDARY_CSV = os.path.join(DATA, "linz_secondary_ports_2026-27.csv")
SECONDARY_URL = "https://www.linz.govt.nz/sites/default/files/2026-06/NZNA_Secondary-ports-2026-27.csv"

FAR_KM = 30.0            # flag a spot whose chosen port is further than this
DAILY_PREFERENCE_KM = 5.0  # take a daily site over a secondary port if it is at most this much further

# Sites that are not representative of fishing water: up-river, at the head of
# an inlet, or deep inside a harbour. They are still valid *standard* ports for
# secondary offsets; they are only skipped when matching a spot. Reasons are ours
# (from the site positions), not LINZ's.
EXCLUDED_FOR_MATCHING: Dict[str, str] = {
    "Dunedin": "head of Otago Harbour",
    "Port Chalmers": "inside Otago Harbour",
    "Helensville": "up the Kaipara River",
    "Dargaville": "up the Northern Wairoa River",
    "Town Basin": "Whangārei Town Basin, head of harbour",
    "Whangārei": "upper Whangārei Harbour",
    "Tāmaki River": "estuary",
    "Onehunga": "inner Manukau Harbour",
    "Havelock": "head of Pelorus Sound",
    "Ōmokoroa": "inside Tauranga Harbour",
    "Ōpōtiki Wharf": "river wharf",
    "Waihopai River Entrance": "Invercargill estuary",
    "Omaha Bridge": "estuary bridge",
    "Weiti River Entrance": "river entrance",
    "Scott Base": "Antarctica",
}
# Mainland/Stewart Island box; outlying islands (Chathams, Kermadecs, subantarctic) are skipped.
NZ_BOX = (-48.0, -34.0, 166.0, 179.0)


@dataclass(frozen=True)
class TidePort:
    id: str                 # "daily:<file>" | "sec:<LINZ no.>"
    name: str
    kind: str               # "daily" | "secondary"
    lat: float
    lon: float
    file: Optional[str] = None          # daily CSV name (for daily) / standard port CSV (secondary)
    standard: Optional[str] = None      # standard port name (secondary only)
    hw_diff_min: Optional[int] = None
    lw_diff_min: Optional[int] = None
    msl: Optional[float] = None
    ratio: Optional[float] = None
    standard_msl: Optional[float] = None
    approximate: bool = False
    area: str = ""

    @property
    def has_heights(self) -> bool:
        return None not in (self.msl, self.ratio, self.standard_msl)

    @property
    def label(self) -> str:
        if self.kind == "daily":
            return f"LINZ {self.name}"
        s = f"LINZ secondary port {self.name} (offsets from {self.standard})"
        return s + (" [LINZ: data approximate]" if self.approximate else "")


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------- parsing ---
_TIME = re.compile(r"^([+-])?\s*(\d{2})(\d{2})$")


def parse_diff(s: str) -> Optional[int]:
    """'+0054' -> 54, '-0107' -> -67, '0000' -> 0, '-'/'' -> None."""
    s = (s or "").strip().replace(" ", "")
    m = _TIME.match(s)
    if not m:
        return None
    v = int(m.group(2)) * 60 + int(m.group(3))
    return -v if m.group(1) == "-" else v


def _num(s: str) -> Optional[float]:
    try:
        return float((s or "").strip())
    except ValueError:
        return None


def _deg(d: str, m: str, neg_default: bool) -> Optional[float]:
    d, m = (d or "").strip(), (m or "").strip()
    west = m.upper().endswith("W") or d.upper().endswith("W")
    d, m = d.rstrip("WwEe"), m.rstrip("WwEe")
    try:
        v = int(d) + float(m) / 60
    except ValueError:
        return None
    if neg_default:      # latitude column: all south in this table
        return -v
    return -v if west else v


def parse_secondary_csv(text: str) -> Tuple[List[TidePort], Dict[str, float]]:
    """Return (secondary ports, {standard port name: standard MSL}).

    Layout (verified 2026-10-25): 3 header rows; a standard port row has
    'hhmm' placeholders and its own MSL and starts a block; following rows with a
    LINZ number are its secondaries; rows with an empty number are area headings;
    blank rows separate blocks.
    """
    rows = list(csv.reader(text.lstrip("\ufeff").splitlines()))
    std_msl: Dict[str, float] = {}
    out: List[TidePort] = []
    current_std = None
    area = ""
    for r in rows[3:]:
        r = (r + [""] * 17)[:17]
        no, name = r[0].strip(), r[1].strip()
        if not no and not name:
            continue
        if not no:
            area = name
            continue
        if r[6].strip().lower() == "hhmm":
            current_std = name
            m = _num(r[14])
            if m is not None:
                std_msl[name] = m
            area = ""
            continue
        if current_std is None:
            continue
        lat, lon = _deg(r[2], r[3], True), _deg(r[4], r[5], False)
        if lat is None or lon is None:
            continue
        out.append(TidePort(
            id=f"sec:{no}", name=name, kind="secondary", lat=round(lat, 4), lon=round(lon, 4),
            file=current_std, standard=current_std,
            hw_diff_min=parse_diff(r[6]), lw_diff_min=parse_diff(r[8]),
            msl=_num(r[14]), ratio=_num(r[15]), approximate=r[16].strip() == "*", area=area))
    out = [TidePort(**{**p.__dict__, "standard_msl": std_msl.get(p.standard)}) for p in out]
    return out, std_msl


@lru_cache(maxsize=1)
def daily_ports() -> Tuple[TidePort, ...]:
    with open(DAILY_JSON, encoding="utf-8") as f:
        d = json.load(f)
    return tuple(TidePort(id=f"daily:{p['file']}", name=p["name"], kind="daily", lat=p["lat"],
                          lon=p["lon"], file=p["file"]) for p in d["ports"])


@lru_cache(maxsize=1)
def secondary_ports() -> Tuple[TidePort, ...]:
    with open(SECONDARY_CSV, encoding="utf-8") as f:
        ports, _ = parse_secondary_csv(f.read())
    daily_files = {p.file for p in daily_ports()}
    # standard port must have a daily CSV for us to derive anything
    return tuple(p for p in ports if p.standard in daily_files)


def all_ports() -> List[TidePort]:
    return list(daily_ports()) + list(secondary_ports())


def get_port(port_id: str) -> TidePort:
    for p in all_ports():
        if p.id == port_id:
            return p
    raise KeyError(port_id)


def find_daily(name_or_file: str) -> Optional[TidePort]:
    for p in daily_ports():
        if name_or_file in (p.name, p.file):
            return p
    return None


# --------------------------------------------------------------- matching ---
def suitability(p: TidePort) -> Optional[str]:
    """None if usable for spot matching, else the reason it is skipped."""
    lo_lat, hi_lat, lo_lon, hi_lon = NZ_BOX
    if not (lo_lat <= p.lat <= hi_lat and lo_lon <= p.lon <= hi_lon):
        return "outside mainland/Stewart Island box"
    if p.name in EXCLUDED_FOR_MATCHING:
        return EXCLUDED_FOR_MATCHING[p.name]
    if p.kind == "secondary":
        if p.hw_diff_min is None or p.lw_diff_min is None:
            return "LINZ gives no HW or LW time difference"
        if not p.has_heights:
            return "LINZ gives no MSL/range ratio (heights unavailable)"
    return None


@dataclass(frozen=True)
class Match:
    port: TidePort
    km: float
    nearest_skipped: Optional[Tuple[TidePort, float, str]]  # a closer site we skipped, and why

    @property
    def far(self) -> bool:
        return self.km > FAR_KM


def nearest_port(lat: float, lon: float, ports: Optional[List[TidePort]] = None) -> Match:
    ports = ports if ports is not None else all_ports()
    ranked = sorted(((haversine_km(lat, lon, p.lat, p.lon), p) for p in ports), key=lambda x: x[0])
    ok = [(d, p) for d, p in ranked if suitability(p) is None]
    if not ok:
        raise ValueError("no suitable port")
    # LINZ "Data Approximate" (*) rows are a last resort: use one only if no
    # other suitable port lies within FAR_KM.
    exact = [(d, p) for d, p in ok if not p.approximate]
    if exact and (exact[0][0] <= FAR_KM or not ok[0][1].approximate):
        ok = exact if exact[0][0] <= FAR_KM else ok
    best_d, best = ok[0]
    if best.kind == "secondary":
        for d, p in ok:
            if p.kind == "daily" and d <= best_d + DAILY_PREFERENCE_KM:
                best_d, best = d, p
                break
            if d > best_d + DAILY_PREFERENCE_KM:
                break
    skipped = None
    for d, p in ranked:
        if d >= best_d:
            break
        why = suitability(p) or ("LINZ marks its data approximate" if p.approximate else None)
        if why and p.name != best.name:
            skipped = (p, round(d, 1), why)
            break
    return Match(best, round(best_d, 1), skipped)


# ------------------------------------------------------------- predictions --
def apply_offsets(events: List[tides.TideEvent], port: TidePort) -> List[tides.TideEvent]:
    """Standard-port highs/lows -> secondary-port highs/lows (LINZ method)."""
    if port.hw_diff_min is None or port.lw_diff_min is None:
        raise ValueError(f"{port.name}: missing time difference")
    src = f"LINZ secondary {port.name} (from {port.standard})"
    out = []
    for e in events:
        dt = timedelta(minutes=port.hw_diff_min if e.kind == "high" else port.lw_diff_min)
        if port.has_heights:
            h = round(port.msl + (e.height - port.standard_msl) * port.ratio, 2)
        else:
            h = float("nan")
        out.append(tides.TideEvent(e.time + dt, h, e.kind, src))
    out.sort(key=lambda e: e.time)
    return out


def fetch_events(port: TidePort, start: date, end: date, cache=None) -> List[tides.TideEvent]:
    if port.kind == "daily":
        return tides.fetch_linz(port.file, start, end, cache)
    std = tides.fetch_linz(port.standard, start, end, cache)
    return apply_offsets(std, port)
