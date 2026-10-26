"""Window confidence from lead time, model agreement and data gaps.

Method (docs/CONFIDENCE.md):

1. **Lead time** sets the starting level: day 0-2 high, 3-6 medium, 7+ low
   (the v2.1 heuristic, unchanged).
2. **Model agreement.** The window is re-scored hour by hour with the same
   scoring function, swapping in each comparison model's wind (speed, gust,
   direction: ECMWF IFS 0.25, GFS, ICON) and, for coastal spots, each wave
   model's total sea height (MeteoFrance MFWAM, ECMWF WAM, GFS-Wave 0.25).
   Everything else (tide, light, rain, pressure, swell period) is held fixed.
   The spread is max - min over the main (Open-Meteo best_match) window
   score and the per-model window scores. Each full ``BAND_WIDTH`` (1.5
   points, the width of the v1 ``marginal`` and ``good`` rating bands) of
   spread lowers confidence one level (at most two). Agreement needs at least
   two comparison models with data for every window hour; otherwise it is
   reported as ``unknown`` and does not change the level.
3. **Data gaps.** If any window hour is missing wind speed or gust, or (coastal)
   both wave and swell height, confidence drops one level.

The level never rises above the lead-time level.
"""
from __future__ import annotations

from typing import Callable, Dict, List, Optional

LEVELS = ["low", "medium", "high"]
BAND_WIDTH = 1.5          # v1 bands: marginal 4.5-6.0, good 6.0-7.5
MAX_STEPS = 2
WIND_VARS = ("wind_speed_10m", "wind_gusts_10m", "wind_direction_10m")


def lead_level(lead_days: int) -> str:
    return "high" if lead_days <= 2 else "medium" if lead_days <= 6 else "low"


def _variant_score(win, rows_by_time, series, keys, rescore) -> Optional[float]:
    scores = []
    for h in win:
        v = (series or {}).get(h["time"])
        if not v or any(v.get(k) is None for k in keys):
            return None
        r = dict(rows_by_time[h["time"]])
        r.update({k: v[k] for k in keys})
        scores.append(rescore(r)["score"])
    return round(sum(scores) / len(scores), 1) if scores else None


def window_confidence(win: List[Dict], rows_by_time: Dict, lead_days: int,
                      rescore: Callable[[Dict], Dict], coastal: bool,
                      wind_models: Optional[Dict[str, Dict]] = None,
                      wave_models: Optional[Dict[str, Dict]] = None) -> Dict:
    lead = lead_level(lead_days)
    main = round(sum(h["score"] for h in win) / len(win), 1)
    scores: Dict[str, float] = {}
    missing: List[str] = []
    for m, series in (wind_models or {}).items():
        s = _variant_score(win, rows_by_time, series, WIND_VARS, rescore)
        (missing.append(m) if s is None else scores.__setitem__(f"wind:{m}", s))
    if coastal:
        for m, series in (wave_models or {}).items():
            s = _variant_score(win, rows_by_time, series, ("wave_height",), rescore)
            (missing.append(m) if s is None else scores.__setitem__(f"waves:{m}", s))
    n_wind = sum(k.startswith("wind:") for k in scores)
    n_wave = sum(k.startswith("waves:") for k in scores)
    known = n_wind >= 2 or n_wave >= 2
    allv = [main] + list(scores.values())
    spread = round(max(allv) - min(allv), 1) if known else None
    steps, why = 0, []
    if known:
        k = min(MAX_STEPS, int(spread // BAND_WIDTH))
        if k:
            lo = min(scores, key=scores.get) if min(scores.values()) < main else "best_match"
            hi = max(scores, key=scores.get) if max(scores.values()) > main else "best_match"
            why.append(f"models disagree: window scores {min(allv):.1f}-{max(allv):.1f} "
                       f"({lo} vs {hi}), spread {spread:.1f} >= {k * BAND_WIDTH:g}")
            steps += k
    gaps = sum(1 for h in win if h.get("wind_kn") is None or h.get("gust_kn") is None
               or (coastal and h.get("wave_m") is None and h.get("swell_m") is None))
    if gaps:
        steps += 1
        why.append(f"data gaps: {gaps} of {len(win)} window hours lack wind/gust" + ("/sea" if coastal else ""))
    level = LEVELS[max(0, LEVELS.index(lead) - steps)]
    return {"level": level, "lead_days": lead_days, "lead_level": lead,
            "agreement": ("unknown" if not known else "good" if spread < BAND_WIDTH / 2
                          else "fair" if spread < BAND_WIDTH else "poor"),
            "score_best_match": main, "model_scores": scores, "score_spread": spread,
            "models_missing": missing, "gap_hours": gaps, "downgrades": why}
