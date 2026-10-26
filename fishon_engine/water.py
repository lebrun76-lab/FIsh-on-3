"""Water and current notes per window (engine 2.6.0).

Two short lines a rec fisher gets at the ramp, meaning first, number second:

  water_temp_note  "Warm enough for snapper and kingfish, water's 17° and steady."
  current_note     "Steady run, normal sinkers should hold. Rising till 9:40am."

plus the raw numbers in ``water`` for charts.

Data, real only:
- Sea temperature: Open-Meteo marine ``sea_surface_temperature`` (the hours
  in the window), and the 3 days before the forecast (openmeteo.
  fetch_sst_history) for the trend. No history, no trend word.
- Temperature vs species: the sourced ``sst_min`` thresholds in
  data/species_conditions.json (snapper 14.8 C, kingfish 16 C). Species
  without a sourced threshold get no temperature verdict.
- Current: an ESTIMATE of tidal flow from the LINZ tide predictions (time and
  height of each high and low). Flow on a cosine tide is fastest mid-tide and
  zero at the turn; its size scales with that tide's range over its duration.
  ``flow_index`` = sin(pi x fraction of the tide gone) x (this tide's rate /
  the median rate over the fetched LINZ tides), so 1.0 is a typical mid-tide
  run and big tides go over 1. It says nothing about local streams, eddies or
  wind-driven drift. Only given where tides come from LINZ, and not at spots
  whose streams LINZ says don't follow the port curve (NO_CURRENT_SPOTS).
  Open-Meteo ocean currents are not used: see docs/OUTPUT.md.

Tuning, not sourced: TREND_STEADY_C, the flow cut-offs (STRONG, WEAK), BIG_TIDE,
SLACK_H (the engine's existing slack rule) and the wording.
"""
from __future__ import annotations

import math
import statistics
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from . import species_scoring
from .tz import fmt_hour

TREND_STEADY_C = 0.4     # tuning: less than this change over 3 days reads "steady"
TREND_DAYS = 3
STRONG = 1.1             # tuning: flow_index at or above = strong run (above a typical mid-tide)
WEAK = 0.5               # tuning: below = not much current
BIG_TIDE = 1.15          # tuning: tide range ratio vs median for "big tide"
SMALL_TIDE = 0.85        # tuning: below = "small tide"
SLACK_H = species_scoring.SLACK_H
# LINZ: "The tidal streams in and around Cook Strait are unreliable"
# (https://www.linz.govt.nz/products-services/tides-and-tidal-streams/tidal-stream-predictions),
# and Sounds channels run up to 5-7 knots locally (Tory Channel, French Pass),
# which the Picton curve can't describe.
NO_CURRENT_SPOTS = {"wellington", "marlborough_sounds"}


# --- sea temperature -------------------------------------------------------

def daily_sst(rows: List[Dict]) -> Dict[date, float]:
    """{date: mean SST} from rows with 'time' and 'sea_surface_temperature' or 'sst_c'."""
    by: Dict[date, List[float]] = {}
    for r in rows:
        v = r.get("sst_c", r.get("sea_surface_temperature"))
        if v is not None and not (isinstance(v, float) and math.isnan(v)):
            by.setdefault(r["time"].date(), []).append(v)
    return {d: sum(v) / len(v) for d, v in by.items()}


def sst_trend(daily: Dict[date, float], d: date) -> Optional[float]:
    """Change in daily mean SST from TREND_DAYS days before ``d`` to ``d``, or None."""
    a, b = daily.get(d - timedelta(days=TREND_DAYS)), daily.get(d)
    return None if a is None or b is None else round(b - a, 1)


def _deg(t: float, near: List[float]) -> str:
    # whole degrees, unless within 1 C of a threshold (14.6 vs 14.8 matters)
    if any(abs(t - x) < 1.0 for x in near):
        return f"{t:.1f}°"
    return f"{round(t)}°"


def _thresholds(species_names: List[str]) -> List[tuple]:
    cond = species_scoring.conditions()
    out = []
    for n in species_names:
        for f in (cond.get(n) or {}).get("factors", []):
            if f["factor"] == "sst_min":
                out.append((n, f["min_c"]))
    return out


def temp_note(sst: Optional[float], change: Optional[float], species_names: List[str]) -> Optional[str]:
    if sst is None:
        return None
    th = _thresholds(species_names)
    num = _deg(sst, [x for _, x in th])
    trend = None
    if change is not None:
        trend = "steady" if abs(change) < TREND_STEADY_C else ("warming" if change > 0 else "cooling")
    if not th:
        if trend == "steady":
            return f"Water's steady at {num}."
        return f"Water's {trend}, {num} now." if trend else f"Water's {num}."
    ok = [n for n, x in th if sst >= x]
    bit = [n for n, x in th if x - 1.0 <= sst < x]
    cold = [n for n, x in th if sst < x - 1.0]
    tail = f"water's {num}" + (f" and {trend}" if trend else "")
    names = species_scoring._names
    if not bit and not cold:
        return f"Warm enough for {names(ok).lower()}, {tail}."
    lead = []
    if cold:
        lead.append(f"Too cold for {names(cold).lower()}")
    if bit:
        lead.append(f"a bit cold for {names(bit).lower()}" if lead else f"A bit cold for {names(bit).lower()}")
    s = " and ".join(lead) + f", {tail}."
    if ok:
        s += f" Fine for {names(ok).lower()}."
    return s


# --- current (estimated from LINZ tides) -----------------------------------

def _rate(a, b) -> float:
    """Peak rate of change of height (m/h) for the tide from a to b."""
    dur = (b.time - a.time).total_seconds() / 3600
    return math.pi * abs(b.height - a.height) / (2 * dur) if dur > 0 else 0.0


def median_rate(events: List) -> Optional[float]:
    rs = [_rate(a, b) for a, b in zip(events, events[1:])]
    rs = [r for r in rs if r > 0]
    return statistics.median(rs) if rs else None


def flow_index(st: Dict, med: float, t: datetime) -> float:
    a, b = st["prev"], st["next"]
    dur = (b.time - a.time).total_seconds()
    frac = min(1.0, max(0.0, (t - a.time).total_seconds() / dur)) if dur > 0 else 0.0
    return round(math.sin(math.pi * frac) * _rate(a, b) / med, 2)


def current(hours: List[Dict], med: Optional[float]) -> Optional[Dict]:
    """Raw current estimate for a window's hours (each with 'tide' at mid-hour)."""
    sts = [(h["time"] + timedelta(minutes=30), h["tide"]) for h in hours if h.get("tide")]
    if not sts or not med:
        return None
    idx = [flow_index(st, med, t) for t, st in sts]
    start, end = hours[0]["time"], hours[-1]["time"] + timedelta(hours=1)
    turns = []
    for _, st in sts:
        for e in (st["prev"], st["next"]):
            if start <= e.time <= end and e not in turns:
                turns.append(e)
    st0 = sts[0][1]
    last = sts[-1][1]
    ratio = round(_rate(last["prev"], last["next"]) / med, 2)
    return {"flow_index_avg": round(sum(idx) / len(idx), 2), "flow_index_max": max(idx),
            "flow_index_start": idx[0], "flow_index_end": idx[-1],
            "tide_size_ratio": ratio,
            "tide_range_m": round(abs(last["next"].height - last["prev"].height), 2),
            "phase": st0["phase"],
            "turn": ({"time": turns[0].time.isoformat(), "type": turns[0].kind} if turns else None),
            "next_turn": {"time": last["next"].time.isoformat(), "type": last["next"].kind},
            "_turn_dt": turns[0].time if turns else None, "_next_dt": last["next"].time,
            "_phase_end": last["phase"]}


def _t5(t: datetime) -> str:
    """Time to the nearest 5 minutes, '7:55am'."""
    return fmt_hour((t + timedelta(minutes=2, seconds=30)).replace(second=0, microsecond=0)
                    .replace(minute=(t + timedelta(minutes=2, seconds=30)).minute // 5 * 5))


def current_note(c: Optional[Dict]) -> Optional[str]:
    if not c:
        return None
    size = "big tide" if c["tide_size_ratio"] >= BIG_TIDE else ("small tide" if c["tide_size_ratio"] < SMALL_TIDE else None)
    if c["_turn_dt"]:
        t = _t5(c["_turn_dt"])
        kind = "high" if c["turn"]["type"] == "high" else "low"
        if c["flow_index_max"] >= STRONG:
            return (f"Strong run either side of the {kind} tide at {t}, so you'll want a heavier sinker. "
                    f"Expect it to go quiet for a bit at the turn.")
        return f"{kind.capitalize()} tide at {t}. Easy fishing round the turn, but expect it to go quiet at slack water."
    nt = c["_next_dt"]
    till = f"{'Rising' if c['_phase_end'] == 'rising' else 'Falling'} till {_t5(nt)}"
    trend = ""
    if c["flow_index_end"] < c["flow_index_start"] - 0.15:
        trend = " but easing"
    elif c["flow_index_end"] > c["flow_index_start"] + 0.15:
        trend = " and building"
    avg = c["flow_index_avg"]
    if avg >= STRONG:
        lead = "Strong run" + (" on a big tide" if size == "big tide" else "") + trend + \
            ", so you'll want a heavier sinker."
    elif avg >= WEAK:
        lead = "Steady run" + trend + ", normal sinkers should hold."
    else:
        lead = "Not much current" + (" yet" if trend == " and building" else "") + \
            ". Easy fishing, but it can go quiet near slack water."
    return f"{lead} {till}."


def public(c: Optional[Dict]) -> Optional[Dict]:
    return {k: v for k, v in c.items() if not k.startswith("_")} if c else None


def window_water(hours: List[Dict], sst_daily: Dict[date, float], species_names: List[str],
                 med_rate: Optional[float], current_ok: bool) -> Dict:
    """Fields for one window: water_temp_note, current_note, water_note, water."""
    ts = [h["sst_c"] for h in hours if h.get("sst_c") is not None]
    sst = round(sum(ts) / len(ts), 1) if ts else None
    change = sst_trend(sst_daily, hours[0]["time"].date()) if sst is not None else None
    tn = temp_note(sst, change, species_names)
    c = current(hours, med_rate) if current_ok else None
    cn = current_note(c)
    trend = None
    if change is not None:
        trend = "steady" if abs(change) < TREND_STEADY_C else ("warming" if change > 0 else "cooling")
    return {"water_temp_note": tn, "current_note": cn,
            "water_note": " ".join(x for x in (tn, cn) if x) or None,
            "water": {"sst_c": sst, "sst_change_3d_c": change, "sst_trend": trend,
                      "current": public(c)}}
