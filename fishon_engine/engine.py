"""Top-level API: forecast_spot() / forecast_many().

The output is the site's v1 ``SpotForecast`` contract (``api_version: "1"``,
see docs/OUTPUT.md) plus additive fields. Everything is computed here, so the
wording, ratings and daily aggregates live in one place.
"""
from __future__ import annotations

import logging
import math
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from . import astro, openmeteo, scoring, species, tideports, tides
from .cache import Cache
from .spots import Spot, get_spot
from .tz import NZ, day_label, fmt_range, now_nz, today_nz

log = logging.getLogger(__name__)

API_VERSION = "1"
OPEN_METEO_SOURCE = "Open-Meteo (CC BY 4.0)"
ATTRIBUTION = [
    "Weather & marine data: Open-Meteo.com (CC BY 4.0)",
    tides.LINZ_ATTRIBUTION,
]
MAX_WINDOWS_PER_DAY = 3
CONFIDENCE_MARGIN = {"high": 0.0, "medium": 0.5, "low": 1.0}
SST_NOTE = ("Sea temperature is the Open-Meteo marine model; vs NOAA Coral Reef Watch 5 km satellite SST "
            "on 23 Oct 2026 it was within about +/-0.9 C at all 21 coastal spots (docs/SST_CHECK.md).")


def _engine_version() -> str:
    from . import __version__
    return __version__


def _confidence(d: date, today: date) -> str:
    # heuristic: skill drops with lead time; marine model shown to ~9 days in v1
    lead = (d - today).days
    return "high" if lead <= 2 else "medium" if lead <= 6 else "low"


def rating(score: Optional[float]) -> str:
    """0-10 score -> v1 Rating (great >=7.5, good >=6, marginal >=4.5, poor)."""
    if score is None or score < 4.5:
        return "poor"
    return "great" if score >= 7.5 else "good" if score >= 6.0 else "marginal"


def _r(x, nd=1):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    return round(x, nd)


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _part_of_day(t: datetime) -> str:
    h = t.hour
    return "early morning" if h < 9 else "morning" if h < 12 else "afternoon" if h < 17 else "evening"


def _spot_out(spot: Spot, wx: Dict, marine: Optional[Dict], cell_sel: str) -> Dict:
    def cell(resp):
        if not resp or resp.get("latitude") is None:
            return None
        return {"lat": resp.get("latitude"), "lon": resp.get("longitude"), "elevation_m": resp.get("elevation")}
    return {
        "id": spot.id, "name": spot.name, "region": spot.region, "island": spot.island,
        "lat": spot.lat, "lon": spot.lon, "species": list(spot.species), "notes": spot.notes,
        "tags": list(spot.tags), "coastal": spot.is_coastal,
        "facing_deg": spot.facing, "facing_note": spot.facing_note,
        "tide_port": spot.tide_port, "tide_port_id": spot.tide_port_id, "tide_port_km": spot.tide_port_km,
        "tide_note": spot.tide_note,
        "forecast_point": {"lat": spot.forecast_lat, "lon": spot.forecast_lon, "cell_selection": cell_sel,
                           "model_cell": cell(wx), "note": spot.wx_note or None},
        "marine_point": ({"lat": spot.marine_lat, "lon": spot.marine_lon, "model_cell": cell(marine)}
                         if spot.is_coastal else None),
    }


def _reasons(summ: Dict, why: List[str], coastal: bool) -> List[str]:
    out = []
    if summ.get("wind_kn") is not None:
        w = f"Wind {summ.get('wind_from') or ''} {summ['wind_kn']:.0f} kn".replace("  ", " ")
        if summ.get("wind_rel"):
            w += f" ({summ['wind_rel']})"
        out.append(w)
    if summ.get("gust_max_kn") is not None:
        out.append(f"Gusts to {summ['gust_max_kn']:.0f} kn")
    if coastal and summ.get("wave_m") is not None:
        s = f"Waves {summ['wave_m']:.1f} m"
        if summ.get("swell_m") is not None:
            s += f" (swell {summ['swell_m']:.1f} m" + (f" @ {summ['swell_period_s']:.0f} s)" if summ.get("swell_period_s") else ")")
        out.append(s)
    out.append(f"Rain {summ['rain_mm']} mm" if summ.get("rain_mm") else "Dry")
    return out + [w[0].upper() + w[1:] for w in why]


def _window_out(win: List[Dict], spot: Spot, target, conf: str) -> Dict:
    summ = scoring.summarise(win, spot.facing, spot.is_coastal)
    rt = rating(summ["score"])
    text = scoring.window_text(summ, win, spot.is_coastal, target if rt != "poor" else None)
    when = fmt_range(summ["start"], summ["end"])
    headline = {"great": f"{when} looks great", "good": f"{when} looks good",
                "marginal": f"{when} is fishable", "poor": f"{when} is the least-bad option"}[rt]
    why = sorted({w for h in win for w in h["why"]})
    return {
        "start": summ["start"].isoformat(), "end": summ["end"].isoformat(), "score": summ["score"],
        "rating": rt, "headline": headline,
        "advice": text if rt != "poor" else "No good window. Least-bad: " + text,
        "reasons": _reasons(summ, why, spot.is_coastal), "confidence": conf,
        "date": summ["start"].date().isoformat(),
        "wind_kn": summ["wind_kn"], "gust_max_kn": summ["gust_max_kn"], "wind_from": summ["wind_from"],
        "wind_rel": summ["wind_rel"], "wave_m": summ["wave_m"], "swell_m": summ["swell_m"],
        "swell_period_s": summ["swell_period_s"], "rain_mm": summ["rain_mm"],
    }


def _verdict(windows: List[Dict], days_out: List[Dict]) -> Dict:
    if not windows:
        return {"rating": "poor", "score": 0, "headline": "No fishable window found",
                "advice": "No usable daylight window in this period.", "confidence": "low",
                "window": None}
    # Highest score wins, but a later, less certain window must beat a nearer
    # one by more than the confidence margin (medium 0.5, low 1.0 points) -
    # a design choice so "Go Sunday" (day 7) doesn't trump an almost-as-good
    # Monday the models agree on.
    best = max(windows, key=lambda w: (w["score"] - CONFIDENCE_MARGIN.get(w.get("confidence"), 0.0),
                                       -datetime.fromisoformat(w["start"]).timestamp()))
    st = datetime.fromisoformat(best["start"])
    when = f"{st.strftime('%A')} {_part_of_day(st)}"
    if best["rating"] in ("great", "good"):
        headline = f"Go {when}"
    elif best["rating"] == "marginal":
        headline = f"Best chance: {when}"
    else:
        headline = "Not worth it this week - stay home or fish sheltered water"
    advice = best["advice"].replace("No good window. Least-bad: ", "Least-bad: ")
    others = sorted({w["date"] for w in windows if w is not best and w["rating"] in ("great", "good")
                     and w["date"] != best["date"]})
    if others:
        labels = [next(d["label"] for d in days_out if d["date"] == o) for o in others[:3]]
        advice += ". Also good: " + ", ".join(labels) + "."
    return {"rating": best["rating"], "score": best["score"], "headline": headline, "advice": advice,
            "confidence": best["confidence"], "window": {"start": best["start"], "end": best["end"]}}


def _species_once(spot: Spot, dates: List[date], sst: Optional[float]) -> List[Dict]:
    """Species status for the first day of the period, listed once per spot;
    ``changes`` lists any day in the period where a status differs."""
    if not dates:
        return []
    first = species.species_for(spot, dates[0], sst)
    for x in first:
        x["changes"] = []
    by = {x["name"]: x for x in first}
    for d in dates[1:]:
        for y in species.species_for(spot, d, sst):
            x = by[y["name"]]
            last = x["changes"][-1]["status"] if x["changes"] else x["status"]
            if y["status"] != last:
                x["changes"].append({"date": d.isoformat(), "status": y["status"]})
    return first


def forecast_spot(spot_id: str, start: Optional[date] = None, days: int = 7,
                  cache: Optional[Cache] = None, compare_tides: bool = False,
                  model_runs: Optional[Dict] = None) -> Dict:
    spot = get_spot(spot_id)
    today = today_nz()
    now = now_nz()
    start = start or today
    days = max(1, min(days, openmeteo.MAX_DAYS))
    end = start + timedelta(days=days - 1)
    warnings: List[str] = []

    cell_sel = "sea" if spot.is_coastal else "land"
    wx = openmeteo.fetch_forecast(spot.forecast_lat, spot.forecast_lon, start, end, cache,
                                  cell_selection=cell_sel)
    rows = openmeteo.hourly_rows(wx)
    sun = openmeteo.daily_sun(wx)

    marine_rows: Dict[datetime, Dict] = {}
    marine = None
    if spot.is_coastal:
        try:
            marine = openmeteo.fetch_marine(spot.marine_lat, spot.marine_lon, start, end, cache)
            marine_rows = {r["time"]: r for r in openmeteo.hourly_rows(marine)}
        except Exception as exc:
            warnings.append(f"Marine data unavailable ({exc}); sea/swell/SST/tide fallback not scored.")
    for r in rows:
        r.update({k: v for k, v in marine_rows.get(r["time"], {}).items() if k != "time"})
    scoring.add_pressure_trend(rows)

    # --- tides -------------------------------------------------------------
    tide_events: List[tides.TideEvent] = []
    tide_source = None
    tide_datum = None
    model_events: List[tides.TideEvent] = []
    if spot.is_coastal and marine_rows:
        mt = sorted(marine_rows)
        model_events = tides.extremes_from_series(mt, [marine_rows[t].get("sea_level_height_msl") for t in mt])
    if spot.is_coastal:
        if spot.tide_port_id:
            try:
                port = tideports.get_port(spot.tide_port_id)
                tide_events = tideports.fetch_events(port, start, end, cache)
                tide_source, tide_datum = port.label, "chart_datum"
            except Exception as exc:
                warnings.append(f"LINZ tides for {spot.tide_port} failed ({exc}); using Open-Meteo model.")
        if not tide_events and model_events:
            tide_events = model_events
            tide_source = "Open-Meteo modelled sea level (approximate, ~8 km model)"
            tide_datum = "msl"
        if spot.tide_note:
            warnings.append(spot.tide_note)
    tide_events_ok = [e for e in tide_events if not math.isnan(e.height)]

    # --- per day -----------------------------------------------------------
    out_days, windows, hourly = [], [], []
    period_dates = []
    for i in range(days):
        d = start + timedelta(days=i)
        day_rows = [r for r in rows if r["time"].date() == d]
        if not day_rows:
            continue
        period_dates.append(d)
        noon = datetime(d.year, d.month, d.day, 12, tzinfo=NZ)
        moon = astro.moon_info(noon)
        hours = [scoring.score_hour(r, coastal=spot.is_coastal, facing=spot.facing, sun=sun.get(d),
                                    tide_events=tide_events, near_new_or_full=moon["near_new_or_full"])
                 for r in day_rows]
        conf = _confidence(d, today)
        for h in hours:
            tm = tides.height_at(tide_events_ok, h["time"]) if tide_events_ok else None
            hourly.append({
                "time": h["time"].isoformat(), "wind_kn": _r(h["wind_kn"]), "gust_kn": _r(h["gust_kn"]),
                "wind_dir_deg": _r(h["wind_from"], 0),
                "swell_m": _r(h["swell_m"], 2) if spot.is_coastal else None,
                "swell_period_s": _r(h["swell_period_s"]) if spot.is_coastal else None,
                "sst_c": _r(h["sst_c"]) if spot.is_coastal else None,
                "tide_m": _r(tm, 2), "rain_mm": _r(h["rain_mm"]), "score": _r(h["score"]),
                # additive
                "wave_m": _r(h["wave_m"], 2) if spot.is_coastal else None,
                "wind_rel": h["wind_rel"], "light": h["light"],
                "tide_phase": h["tide"]["phase"] if h.get("tide") else None,
                "rating": rating(h["score"]),
            })
        sst = scoring._mean([h["sst_c"] for h in hours])
        target = species.pick_target(species.species_for(spot, d, sst))
        wins = scoring.windows(hours, sun.get(d), not_before=now if d == now.date() else None,
                               max_n=MAX_WINDOWS_PER_DAY)
        day_windows = [_window_out(w, spot, target, conf) for w in wins]
        windows.extend(day_windows)
        best = max(day_windows, key=lambda w: w["score"]) if day_windows else None

        s = sun.get(d) or {}
        sr, ss = s.get("sunrise"), s.get("sunset")
        daylight = [h for h in hours if h["light"] in ("day", "change of light")] or hours
        if d == now.date():
            daylight = [h for h in daylight if h["time"] + timedelta(hours=1) > now]
        dl_mean = _mean([h["score"] for h in daylight])
        if best and dl_mean is not None:
            day_score = 0.6 * best["score"] + 0.4 * dl_mean
        elif dl_mean is not None:
            day_score = dl_mean
        else:  # today, nothing fishable left
            day_score = None
        if day_score is not None:
            day_score = round(day_score, 1)   # round first so rating and text agree
        # daily aggregates over sunrise..sunset hours (rain: whole day)
        agg = [h for h in hours if sr and ss and h["time"] + timedelta(hours=1) > sr and h["time"] < ss] or hours
        blocks = scoring.blocks_3h(hours, spot.facing, spot.is_coastal)
        for b in blocks:
            b["start"], b["end"] = b["start"].isoformat(), b["end"].isoformat()
        verdict_text = "No daylight left today" if day_score is None else scoring.verdict(day_score)
        out_days.append({
            "date": d.isoformat(),
            "score": day_score,
            "rating": rating(day_score),
            "summary": scoring.day_summary(hours, agg, best, verdict_text, spot.is_coastal),
            "wind_kn_avg": _r(_mean([h["wind_kn"] for h in agg])),
            "gust_kn_max": _r(max([h["gust_kn"] for h in agg if h["gust_kn"] is not None], default=None)),
            "swell_m_avg": _r(_mean([h["swell_m"] for h in agg]), 2) if spot.is_coastal else None,
            "rain_mm": _r(sum(h["rain_mm"] or 0 for h in hours)),
            "sst_c_avg": _r(sst) if spot.is_coastal else None,
            "sunrise": sr.isoformat() if sr else None,
            "sunset": ss.isoformat() if ss else None,
            # additive
            "wave_m_avg": _r(_mean([h["wave_m"] for h in agg]), 2) if spot.is_coastal else None,
            "wind_kn_max": _r(max([h["wind_kn"] for h in agg if h["wind_kn"] is not None], default=None)),
            "label": day_label(d), "confidence": conf, "verdict_text": verdict_text,
            "best_window": best, "best_window_text": best["advice"] if best else None,
            "windows": len(day_windows), "moon": moon, "blocks_3h": blocks,
        })

    tides_out = [{"time": e.time.isoformat(), "type": e.kind, "height_m": _r(e.height, 2),
                  "datum": tide_datum, "source": e.source}
                 for e in tide_events if start <= e.time.date() <= end]
    tseries = []
    if tide_events_ok and period_dates:
        t = datetime.combine(period_dates[0], datetime.min.time(), NZ)
        t_end = datetime.combine(period_dates[-1], datetime.min.time(), NZ) + timedelta(days=1)
        while t < t_end:
            h = tides.height_at(tide_events_ok, t)
            if h is not None:
                tseries.append({"time": t.isoformat(), "height_m": round(h, 2)})
            t += timedelta(minutes=30)

    if model_runs is None:
        model_runs = openmeteo.fetch_model_runs(cache)
    ifs = model_runs.get("ecmwf_ifs")
    model_run = (f"ECMWF IFS {ifs} (latest run ingested by Open-Meteo best_match)" if ifs
                 else "unavailable (Open-Meteo model metadata not reachable)")
    if any(h["sst_c"] is not None for h in hourly):
        warnings.append(SST_NOTE)
    sources = [OPEN_METEO_SOURCE]
    if tide_source and tide_source.startswith("LINZ"):
        sources.append(tides.LINZ_ATTRIBUTION)
    if tide_source:
        sources.append(f"Tides: {tide_source}")
    if not any("Not for navigation" in x for x in sources):
        sources.append("Not for navigation")

    result = {
        "api_version": API_VERSION,
        "spot": _spot_out(spot, wx, marine, cell_sel),
        "generated_at": now.isoformat(),
        "model_run": model_run,
        "sources": sources,
        "verdict": _verdict(windows, out_days),
        "days": out_days,
        "windows": windows,
        "tides": tides_out,
        "hourly": hourly,
        # additive (v1.1)
        "data_status": "engine",
        "engine_version": _engine_version(),
        "hourly_step_h": 1,
        "timezone": "Pacific/Auckland",
        "model_runs": model_runs,
        "tide_source": tide_source,
        "tide_datum": tide_datum,
        "tide_series": tseries,
        "species": _species_once(spot, period_dates, scoring._mean([h["sst_c"] for h in hourly])),
        "warnings": warnings,
        "attribution": ATTRIBUTION,
        "cache": {"forecast": wx.get("_cache"), "marine": (marine or {}).get("_cache")},
    }
    if compare_tides and tide_source and tide_source.startswith("LINZ") and model_events:
        lo = min(e.time for e in model_events)
        hi = max(e.time for e in model_events)
        result["tide_comparison"] = tides.compare([e for e in tide_events if lo <= e.time <= hi], model_events)
    return result


def forecast_many(spot_ids: List[str], **kw) -> Dict[str, Dict]:
    out = {}
    if "model_runs" not in kw:
        try:
            kw["model_runs"] = openmeteo.fetch_model_runs(kw.get("cache"))
        except Exception:
            pass
    for sid in spot_ids:
        try:
            out[sid] = forecast_spot(sid, **kw)
        except Exception as exc:  # one bad spot must not break the page
            log.warning("forecast failed for %s: %s", sid, exc)
            out[sid] = {"error": str(exc)}
    return out
