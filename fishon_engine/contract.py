"""Minimal validator for the site's v1 SpotForecast contract
(web/docs/forecast-api.md on branch site-prototype). Checks the v1 fields
only; additive fields are allowed. ``validate_v1(fc)`` returns a list of
problems (empty = valid)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

RATINGS = {"great", "good", "marginal", "poor"}
NUM = (int, float)

SPOT = {"id": str, "name": str, "region": str, "island": str, "lat": NUM, "lon": NUM,
        "species": list, "notes": str, "tags": list, "coastal": bool}
HOUR = {"time": str, "wind_kn": NUM, "gust_kn": NUM, "wind_dir_deg": NUM, "swell_m": NUM,
        "swell_period_s": NUM, "sst_c": NUM, "tide_m": NUM, "rain_mm": NUM, "score": NUM}
TIDE = {"time": str, "type": str, "height_m": NUM}
WINDOW = {"start": str, "end": str, "score": NUM, "rating": str, "headline": str, "advice": str,
          "reasons": list}
DAY = {"date": str, "score": NUM, "rating": str, "summary": str, "wind_kn_avg": NUM,
       "gust_kn_max": NUM, "swell_m_avg": NUM, "rain_mm": NUM, "sst_c_avg": NUM,
       "sunrise": str, "sunset": str}
VERDICT = {"rating": str, "score": NUM, "headline": str, "advice": str, "confidence": str}
NULLABLE = {"wind_kn", "gust_kn", "wind_dir_deg", "swell_m", "swell_period_s", "sst_c", "tide_m",
            "rain_mm", "score", "wind_kn_avg", "gust_kn_max", "swell_m_avg", "sst_c_avg", "height_m"}


def _check(obj: Any, shape: Dict, where: str, errs: List[str]) -> None:
    if not isinstance(obj, dict):
        errs.append(f"{where}: not an object")
        return
    for k, t in shape.items():
        if k not in obj:
            errs.append(f"{where}.{k}: missing")
        elif obj[k] is None:
            if k not in NULLABLE:
                errs.append(f"{where}.{k}: null")
        elif not isinstance(obj[k], t) or (t is NUM and isinstance(obj[k], bool)):
            errs.append(f"{where}.{k}: {type(obj[k]).__name__}")
    for k in ("time", "start", "end", "sunrise", "sunset"):
        if isinstance(obj.get(k), str):
            try:
                if datetime.fromisoformat(obj[k]).utcoffset() is None:
                    errs.append(f"{where}.{k}: no UTC offset")
            except ValueError:
                errs.append(f"{where}.{k}: not ISO 8601")
    if "rating" in shape and obj.get("rating") not in RATINGS:
        errs.append(f"{where}.rating: {obj.get('rating')!r}")


def validate_v1(fc: Dict) -> List[str]:
    errs: List[str] = []
    if fc.get("api_version") != "1":
        errs.append("api_version != '1'")
    for k, t in (("generated_at", str), ("model_run", str), ("sources", list), ("days", list),
                 ("windows", list), ("tides", list), ("hourly", list)):
        if not isinstance(fc.get(k), t):
            errs.append(f"{k}: missing or wrong type")
    _check(fc.get("spot"), SPOT, "spot", errs)
    if (fc.get("spot") or {}).get("island") not in ("North", "South"):
        errs.append("spot.island not North|South")
    _check(fc.get("verdict"), VERDICT, "verdict", errs)
    if (fc.get("verdict") or {}).get("confidence") not in ("high", "medium", "low"):
        errs.append("verdict.confidence")
    if not any("Open-Meteo (CC BY 4.0)" in s for s in fc.get("sources") or []):
        errs.append("sources must include 'Open-Meteo (CC BY 4.0)'")
    for i, x in enumerate(fc.get("days") or []):
        _check(x, DAY, f"days[{i}]", errs)
    for i, x in enumerate(fc.get("windows") or []):
        _check(x, WINDOW, f"windows[{i}]", errs)
    for i, x in enumerate(fc.get("tides") or []):
        _check(x, TIDE, f"tides[{i}]", errs)
        if x.get("type") not in ("high", "low"):
            errs.append(f"tides[{i}].type")
    for i, x in enumerate(fc.get("hourly") or []):
        _check(x, HOUR, f"hourly[{i}]", errs)
    return errs
