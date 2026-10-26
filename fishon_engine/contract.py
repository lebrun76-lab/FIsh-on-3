"""Minimal validator for the site's v1 SpotForecast contract
(web/docs/forecast-api.md on branch site-prototype). Checks the v1 fields
only, plus the engine's windows[].id (2.4.0) and, when present, the species
fields (2.5.0); additive fields are allowed. ``validate_v1(fc)`` returns a list of
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
WINDOW = {"id": str, "start": str, "end": str, "score": NUM, "rating": str, "headline": str, "advice": str,
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
    for k, t in (("generated_at", str), ("valid_until", str), ("model_run", str), ("sources", list), ("days", list),
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
    sid = (fc.get("spot") or {}).get("id")
    seen = set()
    for i, x in enumerate(fc.get("windows") or []):
        _check(x, WINDOW, f"windows[{i}]", errs)
        if isinstance(x, dict) and isinstance(x.get("id"), str):
            if x["id"] != f"{sid}:{x.get('start')}/{x.get('end')}":
                errs.append(f"windows[{i}].id: not '<spot.id>:<start>/<end>'")
            if x["id"] in seen:
                errs.append(f"windows[{i}].id: duplicate")
            seen.add(x["id"])
    vw = (fc.get("verdict") or {}).get("window")
    if isinstance(vw, dict) and vw.get("id") not in seen:
        errs.append("verdict.window.id: not in windows[]")
    _check_species(fc, seen, errs)
    for i, x in enumerate(fc.get("tides") or []):
        _check(x, TIDE, f"tides[{i}]", errs)
        if x.get("type") not in ("high", "low"):
            errs.append(f"tides[{i}].type")
    for i, x in enumerate(fc.get("hourly") or []):
        _check(x, HOUR, f"hourly[{i}]", errs)
    return errs


def _bad_dash(t: str) -> bool:
    return "\u2014" in t or " \u2013 " in t or " - " in t


def _check_species(fc: Dict, ids: set, errs: List[str]) -> None:
    """2.5.0 species fields, checked only when present (older outputs pass):
    windows[].species = [{name, score, why}] best first, each score <= the
    window score; target_species is the top one; days[].best_by_species and
    verdict.best_by_species point at windows in windows[]; verdict lines
    carry no em dash or spaced dash."""
    for i, w in enumerate(fc.get("windows") or []):
        if not isinstance(w, dict) or "species" not in w:
            continue
        sp = w["species"]
        if not isinstance(sp, list):
            errs.append(f"windows[{i}].species: not a list")
            continue
        last = None
        for j, x in enumerate(sp):
            if not isinstance(x, dict) or not isinstance(x.get("name"), str) or not isinstance(x.get("why"), str) \
                    or not isinstance(x.get("score"), NUM) or isinstance(x.get("score"), bool):
                errs.append(f"windows[{i}].species[{j}]: needs name (str), score (number), why (str)")
                continue
            if not 0 <= x["score"] <= 10:
                errs.append(f"windows[{i}].species[{j}].score: out of 0-10")
            if isinstance(w.get("score"), NUM) and x["score"] > w["score"]:
                errs.append(f"windows[{i}].species[{j}].score: above the window score")
            if last is not None and x["score"] > last:
                errs.append(f"windows[{i}].species: not sorted best first")
            last = x["score"]
        if sp and isinstance(sp[0], dict) and w.get("target_species") != sp[0].get("name"):
            errs.append(f"windows[{i}].target_species: not the top species")
    places = [(f"days[{i}]", d, "species_verdict") for i, d in enumerate(fc.get("days") or []) if isinstance(d, dict)]
    if isinstance(fc.get("verdict"), dict):
        places.append(("verdict", fc["verdict"], "species_text"))
    for where, obj, text_key in places:
        b = obj.get("best_by_species")
        if b is not None:
            if not isinstance(b, dict):
                errs.append(f"{where}.best_by_species: not an object")
            else:
                for k, v in b.items():
                    if v not in ids:
                        errs.append(f"{where}.best_by_species.{k}: not a window id in windows[]")
        t = obj.get(text_key)
        if t is not None and (not isinstance(t, str) or _bad_dash(t)):
            errs.append(f"{where}.{text_key}: not a string or has an em dash / spaced dash")
