"""Hourly scoring, 3-hour blocks, best windows and plain-English text.

The score is a transparent heuristic (0-10), not a catch-rate model. Each
factor below is listed with its weight so it can be tuned with Alex's local
knowledge or, later, with logged catch reports.

Hour factors (start from 3.0, so a near-perfect hour reaches ~10):
  wind speed (kn)   <6 +2.0 | <10 +1.5 | <15 +0.5 | <20 -1.0 | <25 -2.0 | else -3.5
  wind vs coast     offshore/cross-offshore <15 kn +0.75 (cleaner water, flat inshore),
                    offshore >=18 kn -0.5 (blows small boats out),
                    onshore/cross-onshore >=10 kn -0.75
  gusts             >=25 kn -1.0 | >=35 kn -2.0
  sea (wave height) <0.8 m +1.5 | <1.5 +0.75 | <2.5 -0.5 | <3.5 -1.5 | else -3.0
  swell period      >=13 s with >=1.5 m: -0.75 (long-period surge on rocks/bars)
                    <=6 s with >=1.0 m: -0.5 (short steep chop)
  rain (mm/h)       0 +0.5 | <0.5 0 | <2 -0.5 | else -1.5
  pressure 3 h      falling 1-3 hPa +0.5 | falling >3 hPa -0.5 (front arriving)
  light             within 1.5 h of sunrise/sunset +1.0 | dark -1.0
  tide (coastal)    last 2 h of the flood to high +0.75 | mid-tide running +0.25 |
                    within 45 min of low water -0.25
  moon (per day)    within 2 days of new/full +0.3 (tradition; weak evidence)
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from . import tides as tidemod
from .tz import fmt_hour, fmt_range
from .wind import compass, relative_to_coast, strength_word


def _clamp(x: float) -> float:
    return max(0.0, min(10.0, x))


def score_hour(h: Dict, *, coastal: bool, facing: Optional[float], sun: Optional[Dict],
               tide_events: Optional[List] = None, moon_bonus: float = 0.0) -> Dict:
    s, why = 3.0, []
    ws = h.get("wind_speed_10m")
    wd = h.get("wind_direction_10m")
    if ws is not None:
        d = 2.0 if ws < 6 else 1.5 if ws < 10 else 0.5 if ws < 15 else -1.0 if ws < 20 else -2.0 if ws < 25 else -3.5
        s += d
    rel = relative_to_coast(wd, facing) if coastal and ws is not None and ws >= 4 else None
    if rel and ws is not None:
        if rel in ("offshore", "cross-offshore") and ws < 15:
            s += 0.75; why.append("offshore breeze")
        elif rel == "offshore" and ws >= 18:
            s -= 0.5; why.append("strong offshore")
        elif rel in ("onshore", "cross-onshore") and ws >= 10:
            s -= 0.75; why.append("onshore wind")
    g = h.get("wind_gusts_10m")
    if g is not None:
        if g >= 35:
            s -= 2.0; why.append("damaging gusts")
        elif g >= 25:
            s -= 1.0; why.append("gusty")
    sea = h.get("wave_height") if h.get("wave_height") is not None else h.get("swell_wave_height")
    per = h.get("swell_wave_period")
    if coastal and sea is not None:
        s += 1.5 if sea < 0.8 else 0.75 if sea < 1.5 else -0.5 if sea < 2.5 else -1.5 if sea < 3.5 else -3.0
        if per is not None and per >= 13 and sea >= 1.5:
            s -= 0.75; why.append("long-period surge")
        elif per is not None and per <= 6 and sea >= 1.0:
            s -= 0.5; why.append("short steep chop")
    r = h.get("precipitation")
    if r is not None:
        s += 0.5 if r == 0 else 0 if r < 0.5 else -0.5 if r < 2 else -1.5
    dp = h.get("pressure_3h")
    if dp is not None:
        if -3 <= dp <= -1:
            s += 0.5; why.append("falling pressure")
        elif dp < -3:
            s -= 0.5; why.append("pressure dropping fast")
    t: datetime = h["time"]
    light = None
    if sun and sun.get("sunrise") and sun.get("sunset"):
        mid = t + timedelta(minutes=30)
        near = min(abs((mid - sun["sunrise"]).total_seconds()), abs((mid - sun["sunset"]).total_seconds())) / 3600
        if near <= 1.5:
            s += 1.0; light = "change of light"; why.append("dawn/dusk")
        elif mid < sun["sunrise"] or mid > sun["sunset"]:
            s -= 1.0; light = "dark"
        else:
            light = "day"
    tide = None
    if coastal and tide_events:
        st = tidemod.state_at(tide_events, t + timedelta(minutes=30))
        if st:
            tide = st
            if st["phase"] == "rising" and st["hours_to_next"] <= 2:
                s += 0.75; why.append("run-in to high tide")
            elif st["prev"].kind == "low" and st["hours_since_prev"] <= 0.75 or \
                    st["next"].kind == "low" and st["hours_to_next"] <= 0.75:
                s -= 0.25
            elif 1.5 <= st["hours_since_prev"] and st["hours_to_next"] >= 1.5:
                s += 0.25
    s += moon_bonus
    return {"time": t, "score": round(_clamp(s), 2), "wind_kn": ws, "wind_from": wd,
            "gust_kn": g, "wind_rel": rel, "sea_m": sea, "swell_m": h.get("swell_wave_height"),
            "swell_period_s": per, "rain_mm": r, "sst_c": h.get("sea_surface_temperature"),
            "light": light, "tide": tide, "why": why}


def add_pressure_trend(rows: List[Dict]) -> None:
    for i, r in enumerate(rows):
        p, p0 = r.get("pressure_msl"), rows[i - 3].get("pressure_msl") if i >= 3 else None
        r["pressure_3h"] = (p - p0) if p is not None and p0 is not None else None


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _circ_mean(degs):
    degs = [d for d in degs if d is not None]
    if not degs:
        return None
    x = sum(math.cos(math.radians(d)) for d in degs)
    y = sum(math.sin(math.radians(d)) for d in degs)
    return math.degrees(math.atan2(y, x)) % 360


def summarise(hours: List[Dict], facing: Optional[float], coastal: bool) -> Dict:
    wd = _circ_mean([h["wind_from"] for h in hours])
    return {
        "start": hours[0]["time"], "end": hours[-1]["time"] + timedelta(hours=1),
        "score": round(_mean([h["score"] for h in hours]), 1),
        "wind_kn": _r(_mean([h["wind_kn"] for h in hours])), "wind_from_deg": _r(wd, 0),
        "wind_from": compass(wd), "wind_rel": relative_to_coast(wd, facing) if coastal else None,
        "gust_max_kn": _r(max([h["gust_kn"] for h in hours if h["gust_kn"] is not None], default=None)),
        "sea_m": _r(_mean([h["sea_m"] for h in hours])),
        "swell_period_s": _r(_mean([h["swell_period_s"] for h in hours]), 0),
        "rain_mm": _r(sum(h["rain_mm"] or 0 for h in hours)),
        "sst_c": _r(_mean([h["sst_c"] for h in hours])),
    }


def _r(x, nd=1):
    return None if x is None else round(x, nd)


def blocks_3h(day_hours: List[Dict], facing, coastal) -> List[Dict]:
    out, by = [], {}
    for h in day_hours:
        by.setdefault(h["time"].hour // 3, []).append(h)
    for k in sorted(by):
        b = summarise(by[k], facing, coastal)
        b["label"] = f"{fmt_hour(b['start'])}-{fmt_hour(b['end'])}"
        out.append(b)
    return out


def best_window(day_hours: List[Dict], sun: Optional[Dict], min_len=3, max_len=5,
                not_before: Optional[datetime] = None) -> Optional[List[Dict]]:
    """Best contiguous 3-5 h run between 1 h before sunrise and 1 h after
    sunset (6am-8pm if sun times are unknown). Ties prefer longer windows."""
    if sun and sun.get("sunrise") and sun.get("sunset"):
        lo, hi = sun["sunrise"] - timedelta(hours=1), sun["sunset"] + timedelta(hours=1)
        cand = [h for h in day_hours if h["time"] >= lo - timedelta(minutes=30) and h["time"] + timedelta(hours=1) <= hi + timedelta(minutes=30)]
    else:
        cand = [h for h in day_hours if 6 <= h["time"].hour < 20]
    if not_before is not None:
        cand = [h for h in cand if h["time"] + timedelta(hours=1) > not_before]
    best, best_v = None, -1e9
    for L in range(min_len, max_len + 1):
        for i in range(0, len(cand) - L + 1):
            w = cand[i:i + L]
            if (w[-1]["time"] - w[0]["time"]) != timedelta(hours=L - 1):
                continue  # gap (DST change or missing data)
            v = sum(h["score"] for h in w) / L + 0.05 * L
            if v > best_v:
                best, best_v = w, v
    return best


def window_text(summary: Dict, hours: List[Dict], coastal: bool, target: Optional[Dict]) -> str:
    parts = [fmt_range(summary["start"], summary["end"])]
    if summary["wind_kn"] is not None:
        w = f"{strength_word(summary['wind_kn'])} {summary['wind_from']} {summary['wind_kn']:.0f} kn"
        if summary.get("wind_rel") and summary["wind_kn"] >= 4:
            w = f"{strength_word(summary['wind_kn'])} {summary['wind_rel']} {summary['wind_from']} {summary['wind_kn']:.0f} kn"
        parts.append(w)
    if coastal and summary.get("sea_m") is not None:
        sw = f"{summary['sea_m']:.1f} m sea"
        if summary.get("swell_period_s"):
            sw += f" @ {summary['swell_period_s']:.0f} s"
        parts.append(sw)
    tide_bits = [h["tide"] for h in hours if h.get("tide")]
    if coastal and tide_bits:
        st = tide_bits[0]
        nxt = st["next"]
        if nxt.time <= summary["end"] + timedelta(hours=1):
            parts.append(f"{st['phase']} tide, {nxt.kind} {fmt_hour(nxt.time)}")
        else:
            parts.append(f"{st['phase']} tide")
    if any(h.get("light") == "change of light" for h in hours):
        parts.append("dawn" if summary["start"].hour < 12 else "dusk")
    text = ", ".join(parts)
    if target:
        text += f" - try {target['name'].lower()}" + (f": {target['how']}" if target.get("how") else "")
    return text


def verdict(score: float) -> str:
    if score >= 7.5:
        return "Excellent - go fishing"
    if score >= 6.0:
        return "Good"
    if score >= 4.5:
        return "Fair - pick your window"
    if score >= 3.0:
        return "Marginal"
    return "Poor - stay home / sheltered water only"
