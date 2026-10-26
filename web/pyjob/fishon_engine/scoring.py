"""Hourly scoring, 3-hour blocks, best windows and plain-English text.

The score is a transparent heuristic (0-10), not a catch-rate model. Each
factor below is listed with its weight so it can be tuned with Alex's local
knowledge or, later, with logged catch reports.

Hour factors, engine 2.1 (``WEIGHTS``; the 2.0 set is kept as
``WEIGHTS_V20`` for comparison - see docs/SCORING.md for why each changed).
Start from 2.5; a perfect hour tops out near 9.75, so 10 is never reached.
  wind speed (kn)   <6 +2.5 | <10 +1.75 | <15 +0.5 | <20 -1.0 | <25 -2.25 | else -3.75
  wind vs coast     offshore/cross-offshore <15 kn +0.5, offshore >=18 kn -0.5,
                    onshore/cross-onshore >=10 kn -0.75
  gusts (kn)        <20 0 | <25 -0.5 | <35 -1.25 | else -2.25
  gust ratio        gust > 1.8 x mean with mean >= 8 kn: -0.5 (squally)
  sea (wave height) <0.5 m +2.0 | <1.0 +1.25 | <1.5 +0.25 | <2.5 -0.75 | <3.5 -1.75 | else -3.25
                    (combined sea; swell is reported separately but not double-counted)
  swell period      >=13 s with >=1.5 m: -0.75 (surge) | <=6 s with >=1.0 m: -0.5 (chop)
  rain (mm/h)       0 +0.25 | <0.5 0 | <2 -0.75 | else -1.75
  pressure 3 h      falling 1-3 hPa +0.5 | falling >3 hPa -0.5 (front arriving)
  light             within 1.5 h of sunrise/sunset +0.75 | dark -1.25
  tide (coastal)    last 2 h of the flood +0.5 | mid-tide running +0.25 | within 45 min of low -0.25
  moon (per day)    within 2 days of new/full +0.25 (tradition; weak evidence)
Ratings use the site's v1 bands: great >=7.5, good >=6, marginal >=4.5, poor.
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


def _band(x: float, bands) -> float:
    """bands = [(upper_exclusive, points), ..., (None, points_else)]"""
    for hi, pts in bands:
        if hi is None or x < hi:
            return pts
    return 0.0


# Engine 2.0 weights (kept for comparison: tools/score_distribution.py).
WEIGHTS_V20 = {
    "base": 3.0,
    "wind": [(6, 2.0), (10, 1.5), (15, 0.5), (20, -1.0), (25, -2.0), (None, -3.5)],
    "offshore_light": 0.75, "offshore_strong": -0.5, "onshore": -0.75,
    "gust": [(25, 0.0), (35, -1.0), (None, -2.0)],
    "gust_ratio": None,
    "sea": [(0.8, 1.5), (1.5, 0.75), (2.5, -0.5), (3.5, -1.5), (None, -3.0)],
    "surge": -0.75, "chop": -0.5,
    "rain": [(0.5, 0.0), (2, -0.5), (None, -1.5)], "dry": 0.5,
    "pressure_falling": 0.5, "pressure_crash": -0.5,
    "light_change": 1.0, "dark": -1.0,
    "tide_runin": 0.75, "tide_mid": 0.25, "tide_low": -0.25,
    "moon": 0.3,
}

# Engine 2.1 weights (see docs/SCORING.md for the calibration run). Changes:
# lower base, smaller "free" bonuses (dry hour, light, tide), gust penalties
# start at 20 kn and also bite when gusts are >1.8x the mean, and the sea term
# is graded more finely below 1.5 m. A flat, calm, dry dawn with the tide
# running in still reaches 9.75 (max); an ordinary 10-15 kn, 1 m day lands ~4.5-6.
WEIGHTS = {
    "base": 2.5,
    "wind": [(6, 2.5), (10, 1.75), (15, 0.5), (20, -1.0), (25, -2.25), (None, -3.75)],
    "offshore_light": 0.5, "offshore_strong": -0.5, "onshore": -0.75,
    "gust": [(20, 0.0), (25, -0.5), (35, -1.25), (None, -2.25)],
    "gust_ratio": (1.8, 8.0, -0.5),        # gust/mean >1.8 with mean >=8 kn: squally
    "sea": [(0.5, 2.0), (1.0, 1.25), (1.5, 0.25), (2.5, -0.75), (3.5, -1.75), (None, -3.25)],
    "surge": -0.75, "chop": -0.5,
    "rain": [(0.5, 0.0), (2, -0.75), (None, -1.75)], "dry": 0.25,
    "pressure_falling": 0.5, "pressure_crash": -0.5,
    "light_change": 0.75, "dark": -1.25,
    "tide_runin": 0.5, "tide_mid": 0.25, "tide_low": -0.25,
    "moon": 0.25,
}


def score_hour(h: Dict, *, coastal: bool, facing: Optional[float], sun: Optional[Dict],
               tide_events: Optional[List] = None, moon_bonus: Optional[float] = None,
               near_new_or_full: bool = False, weights: Optional[Dict] = None) -> Dict:
    W = weights or WEIGHTS
    s, why = W["base"], []
    ws = h.get("wind_speed_10m")
    wd = h.get("wind_direction_10m")
    if ws is not None:
        s += _band(ws, W["wind"])
    rel = relative_to_coast(wd, facing) if coastal and ws is not None and ws >= 4 else None
    if rel and ws is not None:
        if rel in ("offshore", "cross-offshore") and ws < 15:
            s += W["offshore_light"]; why.append("offshore breeze")
        elif rel == "offshore" and ws >= 18:
            s += W["offshore_strong"]; why.append("strong offshore")
        elif rel in ("onshore", "cross-onshore") and ws >= 10:
            s += W["onshore"]; why.append("onshore wind")
    g = h.get("wind_gusts_10m")
    if g is not None:
        d = _band(g, W["gust"])
        s += d
        if d <= -2.0:
            why.append("damaging gusts")
        elif d < 0:
            why.append("gusty")
        gr = W.get("gust_ratio")
        if gr and ws is not None and ws >= gr[1] and g > gr[0] * ws:
            s += gr[2]; why.append("squally (gusts well above the mean)")
    wave = h.get("wave_height")
    swell = h.get("swell_wave_height")
    sea = wave if wave is not None else swell
    per = h.get("swell_wave_period")
    if coastal and sea is not None:
        s += _band(sea, W["sea"])
        if per is not None and per >= 13 and sea >= 1.5:
            s += W["surge"]; why.append("long-period surge")
        elif per is not None and per <= 6 and sea >= 1.0:
            s += W["chop"]; why.append("short steep chop")
    r = h.get("precipitation")
    if r is not None:
        s += W["dry"] if r == 0 else _band(r, W["rain"])
    dp = h.get("pressure_3h")
    if dp is not None:
        if -3 <= dp <= -1:
            s += W["pressure_falling"]; why.append("falling pressure")
        elif dp < -3:
            s += W["pressure_crash"]; why.append("pressure dropping fast")
    t: datetime = h["time"]
    light = None
    if sun and sun.get("sunrise") and sun.get("sunset"):
        mid = t + timedelta(minutes=30)
        near = min(abs((mid - sun["sunrise"]).total_seconds()), abs((mid - sun["sunset"]).total_seconds())) / 3600
        if near <= 1.5:
            s += W["light_change"]; light = "change of light"; why.append("dawn/dusk")
        elif mid < sun["sunrise"] or mid > sun["sunset"]:
            s += W["dark"]; light = "dark"
        else:
            light = "day"
    tide = None
    if coastal and tide_events:
        st = tidemod.state_at(tide_events, t + timedelta(minutes=30))
        if st:
            tide = st
            if st["phase"] == "rising" and st["hours_to_next"] <= 2:
                s += W["tide_runin"]; why.append("run-in to high tide")
            elif st["prev"].kind == "low" and st["hours_since_prev"] <= 0.75 or \
                    st["next"].kind == "low" and st["hours_to_next"] <= 0.75:
                s += W["tide_low"]
            elif 1.5 <= st["hours_since_prev"] and st["hours_to_next"] >= 1.5:
                s += W["tide_mid"]
    if moon_bonus is not None:
        s += moon_bonus
    elif near_new_or_full:
        s += W["moon"]
    return {"time": t, "score": round(_clamp(s), 2), "wind_kn": ws, "wind_from": wd,
            "gust_kn": g, "wind_rel": rel, "sea_m": sea, "wave_m": wave, "swell_m": swell,
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
        "wave_m": _r(_mean([h.get("wave_m") for h in hours])),
        "swell_m": _r(_mean([h.get("swell_m") for h in hours])),
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


def _candidates(day_hours, sun, not_before):
    if sun and sun.get("sunrise") and sun.get("sunset"):
        lo, hi = sun["sunrise"] - timedelta(hours=1), sun["sunset"] + timedelta(hours=1)
        cand = [h for h in day_hours if h["time"] >= lo - timedelta(minutes=30) and h["time"] + timedelta(hours=1) <= hi + timedelta(minutes=30)]
    else:
        cand = [h for h in day_hours if 6 <= h["time"].hour < 20]
    if not_before is not None:
        cand = [h for h in cand if h["time"] + timedelta(hours=1) > not_before]
    return cand


def _best_run(cand, min_len, max_len, taken=()):
    best, best_v = None, -1e9
    for L in range(min_len, max_len + 1):
        for i in range(0, len(cand) - L + 1):
            w = cand[i:i + L]
            if (w[-1]["time"] - w[0]["time"]) != timedelta(hours=L - 1):
                continue  # gap (DST change or missing data)
            if any(h["time"] in taken for h in w):
                continue
            v = sum(h["score"] for h in w) / L + 0.05 * L
            if v > best_v:
                best, best_v = w, v
    return best


def best_window(day_hours: List[Dict], sun: Optional[Dict], min_len=3, max_len=5,
                not_before: Optional[datetime] = None) -> Optional[List[Dict]]:
    """Best contiguous 3-5 h run between 1 h before sunrise and 1 h after
    sunset (6am-8pm if sun times are unknown). Ties prefer longer windows."""
    return _best_run(_candidates(day_hours, sun, not_before), min_len, max_len)


def windows(day_hours: List[Dict], sun: Optional[Dict], min_len=3, max_len=5,
            not_before: Optional[datetime] = None, max_n: int = 3,
            min_score: float = 4.5, within: float = 1.5, gap_h: int = 2) -> List[List[Dict]]:
    """Up to ``max_n`` non-overlapping daylight windows for one day, in time
    order. The first is always the day's best (even if poor). Each extra
    window must score >= ``min_score`` (v1 'marginal') and be within
    ``within`` points of the best, and is kept >= ``gap_h`` hours away from the
    windows already chosen, so the list reads e.g. "dawn ... and again at dusk"
    rather than two halves of the same spell."""
    cand = _candidates(day_hours, sun, not_before)
    first = _best_run(cand, min_len, max_len)
    if not first:
        return []
    chosen = [first]
    top = _mean([h["score"] for h in first])
    while len(chosen) < max_n:
        taken = set()
        for w in chosen:
            for k in range(-gap_h, len(w) + gap_h):
                taken.add(w[0]["time"] + timedelta(hours=k))
        nxt = _best_run(cand, min_len, max_len, taken)
        if not nxt:
            break
        sc = _mean([h["score"] for h in nxt])
        if sc < min_score or sc < top - within:
            break
        chosen.append(nxt)
    return sorted(chosen, key=lambda w: w[0]["time"])


def day_summary(hours: List[Dict], daylight: List[Dict], best: Optional[Dict], verdict_text: str,
                coastal: bool) -> str:
    """One plain-English line for the day, e.g. 'Good. Light winds early,
    15-20 kn by afternoon; 1.2 m sea. Best: Sat 6-10am.'"""
    if not daylight:
        return verdict_text
    am = [h["wind_kn"] for h in daylight if h["time"].hour < 12 and h["wind_kn"] is not None]
    pm = [h["wind_kn"] for h in daylight if h["time"].hour >= 12 and h["wind_kn"] is not None]
    bits = []
    if am and pm:
        a, p = sum(am) / len(am), sum(pm) / len(pm)
        if abs(a - p) < 4:
            bits.append(f"{strength_word((a + p) / 2)} winds all day (~{(a + p) / 2:.0f} kn)")
        elif a < p:
            bits.append(f"{strength_word(a)} morning (~{a:.0f} kn), {strength_word(p)} afternoon (~{p:.0f} kn)")
        else:
            bits.append(f"{strength_word(a)} morning (~{a:.0f} kn), easing to ~{p:.0f} kn in the afternoon")
    elif am or pm:
        xs = am or pm
        bits.append(f"{strength_word(sum(xs) / len(xs))} winds (~{sum(xs) / len(xs):.0f} kn)")
    sea = _mean([h.get("wave_m") for h in daylight])
    if coastal and sea is not None:
        bits.append(f"{sea:.1f} m sea")
    rain = sum(h["rain_mm"] or 0 for h in hours)
    if rain >= 1:
        bits.append(f"{rain:.0f} mm rain")
    text = verdict_text + ". " + "; ".join(b[0].upper() + b[1:] if i == 0 else b for i, b in enumerate(bits))
    if best:
        text += f". Best: {best['headline'].split(' looks')[0].split(' is ')[0]}"
    return text[0].upper() + text[1:] + "."


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
    """Day wording; the bands are the v1 rating bands (great >= 7.5,
    good >= 6, marginal >= 4.5, else poor) so text and rating always agree."""
    if score >= 7.5:
        return "Excellent - go fishing"
    if score >= 6.0:
        return "Good"
    if score >= 4.5:
        return "Marginal - pick your window"
    return "Poor - stay home / sheltered water only"
