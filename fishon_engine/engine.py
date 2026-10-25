"""Top-level API: forecast_spot() / forecast_many()."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from . import astro, openmeteo, scoring, species, tideports, tides
from .cache import Cache
from .spots import get_spot
from .tz import NZ, day_label, now_nz, today_nz

log = logging.getLogger(__name__)

ATTRIBUTION = [
    "Weather & marine data: Open-Meteo.com (CC BY 4.0)",
    tides.LINZ_ATTRIBUTION,
]


def _confidence(d: date, today: date) -> str:
    # heuristic: skill drops with lead time; marine model shown to ~9 days in v1
    lead = (d - today).days
    return "high" if lead <= 2 else "medium" if lead <= 6 else "low"


def forecast_spot(spot_id: str, start: Optional[date] = None, days: int = 7,
                  cache: Optional[Cache] = None, compare_tides: bool = False) -> Dict:
    spot = get_spot(spot_id)
    today = today_nz()
    start = start or today
    days = max(1, min(days, openmeteo.MAX_DAYS))
    end = start + timedelta(days=days - 1)
    warnings: List[str] = []

    wx = openmeteo.fetch_forecast(spot.lat, spot.lon, start, end, cache)
    rows = openmeteo.hourly_rows(wx)
    sun = openmeteo.daily_sun(wx)

    marine_rows: Dict[datetime, Dict] = {}
    marine_meta = None
    if spot.is_coastal:
        try:
            m = openmeteo.fetch_marine(spot.marine_lat, spot.marine_lon, start, end, cache)
            marine_meta = m.get("_cache")
            marine_rows = {r["time"]: r for r in openmeteo.hourly_rows(m)}
        except Exception as exc:
            warnings.append(f"Marine data unavailable ({exc}); sea/swell/SST/tide fallback not scored.")
    for r in rows:
        r.update({k: v for k, v in marine_rows.get(r["time"], {}).items() if k != "time"})
    scoring.add_pressure_trend(rows)

    # --- tides -------------------------------------------------------------
    tide_events: List[tides.TideEvent] = []
    tide_source = None
    model_events: List[tides.TideEvent] = []
    if spot.is_coastal and marine_rows:
        mt = sorted(marine_rows)
        model_events = tides.extremes_from_series(mt, [marine_rows[t].get("sea_level_height_msl") for t in mt])
    if spot.is_coastal:
        if spot.tide_port_id:
            try:
                port = tideports.get_port(spot.tide_port_id)
                tide_events = tideports.fetch_events(port, start, end, cache)
                tide_source = port.label
            except Exception as exc:
                warnings.append(f"LINZ tides for {spot.tide_port} failed ({exc}); using Open-Meteo model.")
        if not tide_events and model_events:
            tide_events = model_events
            tide_source = "Open-Meteo modelled sea level (approximate, ~8 km model)"
        if spot.tide_note:
            warnings.append(spot.tide_note)

    # --- per day -----------------------------------------------------------
    out_days = []
    for i in range(days):
        d = start + timedelta(days=i)
        day_rows = [r for r in rows if r["time"].date() == d]
        if not day_rows:
            continue
        noon = datetime(d.year, d.month, d.day, 12, tzinfo=NZ)
        moon = astro.moon_info(noon)
        mb = 0.3 if moon["near_new_or_full"] else 0.0
        hours = [scoring.score_hour(r, coastal=spot.is_coastal, facing=spot.facing, sun=sun.get(d),
                                    tide_events=tide_events, moon_bonus=mb) for r in day_rows]
        sst = scoring._mean([h["sst_c"] for h in hours])
        sp = species.species_for(spot, d, sst)
        target = species.pick_target(sp)
        now = now_nz()
        win = scoring.best_window(hours, sun.get(d), not_before=now if d == now.date() else None)
        best = None
        if win:
            summ = scoring.summarise(win, spot.facing, spot.is_coastal)
            best = {**summ, "start": summ["start"].isoformat(), "end": summ["end"].isoformat(),
                    "text": (scoring.window_text(summ, win, spot.is_coastal, target) if summ["score"] >= 4.0
                             else "No good window. Least-bad: "
                             + scoring.window_text(summ, win, spot.is_coastal, None)),
                    "why": sorted({w for h in win for w in h["why"]})}
        daylight = [h for h in hours if h["light"] in ("day", "change of light")] or hours
        if d == now.date():
            daylight = [h for h in daylight if h["time"] + timedelta(hours=1) > now]
        dl_mean = sum(h["score"] for h in daylight) / len(daylight) if daylight else None
        if best and dl_mean is not None:
            day_score = 0.6 * best["score"] + 0.4 * dl_mean
        elif dl_mean is not None:
            day_score = dl_mean
        else:  # today, nothing fishable left
            day_score = None
        blocks = scoring.blocks_3h(hours, spot.facing, spot.is_coastal)
        for b in blocks:
            b["start"], b["end"] = b["start"].isoformat(), b["end"].isoformat()
        day_tides = [{"time": e.time.isoformat(), "kind": e.kind, "height_m": e.height}
                     for e in tide_events if e.time.date() == d]
        s = sun.get(d) or {}
        out_days.append({
            "date": d.isoformat(), "label": day_label(d),
            "score": None if day_score is None else round(day_score, 1),
            "verdict": "No daylight left today" if day_score is None else scoring.verdict(day_score),
            "confidence": _confidence(d, today),
            "best_window": best, "blocks_3h": blocks,
            "sunrise": s.get("sunrise").isoformat() if s.get("sunrise") else None,
            "sunset": s.get("sunset").isoformat() if s.get("sunset") else None,
            "moon": moon, "sst_c": None if sst is None else round(sst, 1),
            "tides": day_tides, "species": sp,
        })

    result = {
        "spot": {"id": spot.id, "name": spot.name, "region": spot.region, "facing_deg": spot.facing,
                 "facing_note": spot.facing_note, "coastal": spot.is_coastal,
                 "tide_port": spot.tide_port, "tide_port_id": spot.tide_port_id,
                 "tide_port_km": spot.tide_port_km},
        "generated_at": now_nz().isoformat(), "timezone": "Pacific/Auckland",
        "tide_source": tide_source, "days": out_days, "warnings": warnings,
        "attribution": ATTRIBUTION,
        "cache": {"forecast": wx.get("_cache"), "marine": marine_meta},
    }
    if compare_tides and tide_source and tide_source.startswith("LINZ") and model_events:
        lo = min(e.time for e in model_events)
        hi = max(e.time for e in model_events)
        result["tide_comparison"] = tides.compare([e for e in tide_events if lo <= e.time <= hi], model_events)
    return result


def forecast_many(spot_ids: List[str], **kw) -> Dict[str, Dict]:
    out = {}
    for sid in spot_ids:
        try:
            out[sid] = forecast_spot(sid, **kw)
        except Exception as exc:  # one bad spot must not break the page
            log.warning("forecast failed for %s: %s", sid, exc)
            out[sid] = {"error": str(exc)}
    return out
