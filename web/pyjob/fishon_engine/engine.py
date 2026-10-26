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

from . import astro, confidence, openmeteo, scoring, species, tideports, tides
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
# Every separate window scoring >= 4.5 is listed (scoring.windows); no cap.
# With 3 h windows kept >= 2 h apart a daylight day fits at most 4.
MAX_WINDOWS_PER_DAY = None
# A window is flagged near_best when it scores within this many points of the
# day's best window (the old cut-off for listing extra windows at all).
NEAR_BEST_POINTS = 1.5
CONFIDENCE_MARGIN = {"high": 0.0, "medium": 0.5, "low": 1.0}
# The headline verdict looks at the first HORIZON_DAYS days of the period
# (start .. start+2), not the best of up to 16 days; a better window later on
# is reported separately in verdict.best_later.
HORIZON_DAYS = 3
SST_NOTE = ("Sea temperature is the Open-Meteo marine model (all-hours mean; it includes daytime warming). "
            "Against NOAA Coral Reef Watch 5 km night-only satellite SST on 22-23 Oct 2026 it was within "
            "about +/-1.2 C at all 21 coastal spots, with no net bias at night (docs/SST_CHECK.md).")


def _engine_version() -> str:
    from . import __version__
    return __version__


def _confidence(d: date, today: date) -> str:
    # lead-time starting level; windows then adjust for model agreement and
    # data gaps (confidence.py, docs/CONFIDENCE.md)
    return confidence.lead_level((d - today).days)


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
        "tide_port_linz_name": spot.tide_port_linz_name,
        "tide_note": spot.tide_note,
        "forecast_point": {"lat": spot.forecast_lat, "lon": spot.forecast_lon, "cell_selection": cell_sel,
                           "model_cell": cell(wx), "note": spot.wx_note or None},
        "marine_point": ({"lat": spot.marine_lat, "lon": spot.marine_lon, "model_cell": cell(marine),
                          "note": spot.marine_note or None}
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


def window_id(spot_id: str, start: str, end: str) -> str:
    """Stable window id: ``<spot_id>:<start ISO>/<end ISO>`` (NZ local time
    with offset). Built only from the spot and the window's times, so the
    same window gets the same id on every run whatever its score."""
    return f"{spot_id}:{start}/{end}"


def _window_out(win: List[Dict], spot: Spot, target, conf: str) -> Dict:
    summ = scoring.summarise(win, spot.facing, spot.is_coastal)
    rt = rating(summ["score"])
    text = scoring.window_text(summ, win, spot.is_coastal, target if rt != "poor" else None)
    when = fmt_range(summ["start"], summ["end"])
    headline = {"great": f"{when} looks great", "good": f"{when} looks good",
                "marginal": f"{when} is fishable", "poor": f"{when} is the least-bad option"}[rt]
    why = sorted({w for h in win for w in h["why"]})
    start, end = summ["start"].isoformat(), summ["end"].isoformat()
    return {
        "id": window_id(spot.id, start, end),
        "start": start, "end": end, "score": summ["score"],
        "rating": rt, "headline": headline,
        "advice": text if rt != "poor" else "No good window. Least-bad: " + text,
        "reasons": _reasons(summ, why, spot.is_coastal), "confidence": conf,
        "date": summ["start"].date().isoformat(),
        "wind_kn": summ["wind_kn"], "gust_max_kn": summ["gust_max_kn"], "wind_from": summ["wind_from"],
        "wind_rel": summ["wind_rel"], "wave_m": summ["wave_m"], "swell_m": summ["swell_m"],
        "swell_period_s": summ["swell_period_s"], "rain_mm": summ["rain_mm"],
        # 2.4.0: the species the advice names ("Try snapper"), or null
        "target_species": target["name"] if target and rt != "poor" else None,
    }


def _day_score(top_score: Optional[float], daylight: List[Dict]) -> Optional[float]:
    """0.6 x best window + 0.4 x mean daylight hour, rounded to 1 dp (rounded
    first so rating and text agree). None when there are no daylight hours."""
    dl_mean = _mean([h["score"] for h in daylight])
    if dl_mean is None:
        return None
    return round(0.6 * top_score + 0.4 * dl_mean if top_score is not None else dl_mean, 1)


def _pick(windows: List[Dict]) -> Dict:
    # Highest score wins, but a later, less certain window must beat a nearer
    # one by more than the confidence margin (medium 0.5, low 1.0 points) -
    # a design choice so "Go Sunday" (day 7) doesn't trump an almost-as-good
    # Monday the models agree on.
    return max(windows, key=lambda w: (w["score"] - CONFIDENCE_MARGIN.get(w.get("confidence"), 0.0),
                                       -datetime.fromisoformat(w["start"]).timestamp()))


def _when(w: Dict) -> str:
    st = datetime.fromisoformat(w["start"])
    return f"{st.strftime('%A')} {_part_of_day(st)}"


def _brief(w: Optional[Dict]) -> Optional[Dict]:
    if not w:
        return None
    return {k: w[k] for k in ("id", "start", "end", "date", "score", "rating", "headline", "advice", "confidence")}


def _no_window_reason(least: Optional[Dict], span: str) -> str:
    """``span`` e.g. 'in the next 3 days' or 'on Tue 27 Oct'."""
    if not least:
        return f"No daylight window left {span}."
    why = "; ".join(least["reasons"][:3])
    return (f"No fishable window {span}: no daylight run of hours scores 4.5 (marginal) or more. "
            f"Least-bad is {fmt_range(datetime.fromisoformat(least['start']), datetime.fromisoformat(least['end']))} "
            f"at {least['score']:.1f}/10 ({why}).")


def _verdict(fishable: List[Dict], least_bad: List[Dict], days_out: List[Dict], start: date) -> Dict:
    """Headline from the fishable (rating != poor) windows in the first
    HORIZON_DAYS days. With none, ``window`` is null and ``no_window_reason``
    says why; the least-bad option is only in the labelled ``least_bad``."""
    h_end = start + timedelta(days=HORIZON_DAYS - 1)
    in_h = [w for w in fishable if date.fromisoformat(w["date"]) <= h_end]
    later = [w for w in fishable if date.fromisoformat(w["date"]) > h_end]
    n_days = min(HORIZON_DAYS, len(days_out)) or 1
    base = {"horizon_days": n_days, "horizon_end": min(h_end, start + timedelta(days=max(len(days_out), 1) - 1)).isoformat(),
            "best_later": _brief(_pick(later)) if later else None}
    if not in_h:
        cand = [w for w in least_bad if date.fromisoformat(w["date"]) <= h_end]
        least = max(cand, key=lambda w: w["score"]) if cand else None
        reason = _no_window_reason(least, f"in the next {n_days} days" if n_days > 1 else "today")
        advice = reason
        if later:
            b = base["best_later"]
            advice += f" Next fishable: {_when(b)} ({b['rating']}, {b['score']:.1f})."
        return {"rating": "poor", "score": least["score"] if least else 0,
                "headline": f"No fishable window in the next {n_days} days" if n_days > 1
                else "No fishable window today",
                "advice": advice, "confidence": least["confidence"] if least else "low",
                "window": None, "no_window_reason": reason,
                "least_bad": dict(_brief(least), label="least-bad (not recommended)") if least else None, **base}
    best = _pick(in_h)
    when = _when(best)
    headline = f"Go {when}" if best["rating"] in ("great", "good") else f"Best chance: {when}"
    advice = best["advice"]
    others = sorted({w["date"] for w in in_h if w is not best and w["rating"] in ("great", "good")
                     and w["date"] != best["date"]})
    if others:
        labels = [next(d["label"] for d in days_out if d["date"] == o) for o in others[:3]]
        advice += ". Also good: " + ", ".join(labels) + "."
    return {"rating": best["rating"], "score": best["score"], "headline": headline, "advice": advice,
            "confidence": best["confidence"], "window": {"id": best["id"], "start": best["start"], "end": best["end"]},
            "no_window_reason": None, "least_bad": None, **base}


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

    # --- model comparison for confidence (docs/CONFIDENCE.md) --------------
    wind_models: Dict[str, Dict] = {}
    wave_models: Dict[str, Dict] = {}
    cmp_cache: Dict[str, Optional[Dict]] = {}
    try:
        wm = openmeteo.fetch_wind_models(spot.forecast_lat, spot.forecast_lon, start, end, cache,
                                         cell_selection=cell_sel)
        cmp_cache["wind_models"] = wm.get("_cache")
        wind_models = openmeteo.model_columns(wm, list(confidence.WIND_VARS), openmeteo.COMPARE_WIND_MODELS)
    except Exception as exc:
        warnings.append(f"Wind model comparison unavailable ({exc}); confidence uses lead time and data gaps only.")
    if spot.is_coastal:
        try:
            vm = openmeteo.fetch_wave_models(spot.marine_lat, spot.marine_lon, start, end, cache)
            cmp_cache["wave_models"] = vm.get("_cache")
            wave_models = openmeteo.model_columns(vm, openmeteo.COMPARE_WAVE_HOURLY, openmeteo.COMPARE_WAVE_MODELS)
        except Exception as exc:
            warnings.append(f"Wave model comparison unavailable ({exc}); confidence uses lead time and data gaps only.")

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
    out_days, windows, least_bad_all, hourly = [], [], [], []
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
        rows_by_time = {r["time"]: r for r in day_rows}

        def rescore(r, _d=d, _m=moon):
            return scoring.score_hour(r, coastal=spot.is_coastal, facing=spot.facing, sun=sun.get(_d),
                                      tide_events=tide_events, near_new_or_full=_m["near_new_or_full"])
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
        day_windows = []
        for w in wins:
            cd = confidence.window_confidence(w, rows_by_time, (d - today).days, rescore, spot.is_coastal,
                                              wind_models, wave_models)
            wo = _window_out(w, spot, target, cd["level"])
            wo["confidence_detail"] = cd
            day_windows.append(wo)
        if day_windows:
            day_top = max(w["score"] for w in day_windows)
            for wo in day_windows:
                wo["near_best"] = wo["score"] >= round(day_top - NEAR_BEST_POINTS, 1)
        fishable = [w for w in day_windows if w["rating"] != "poor"]
        windows.extend(fishable)
        top = max(day_windows, key=lambda w: w["score"]) if day_windows else None   # for the day score
        best = max(fishable, key=lambda w: w["score"]) if fishable else None
        least = None
        if not fishable and top:
            least = dict(top, label="least-bad (not recommended)")
            least_bad_all.append(top)
        no_win = None if best else _no_window_reason(top, f"on {day_label(d)}")

        s = sun.get(d) or {}
        sr, ss = s.get("sunrise"), s.get("sunset")
        daylight = [h for h in hours if h["light"] in ("day", "change of light")] or hours
        is_today = d == now.date()
        day_score = _day_score(top["score"] if top else None,
                               [h for h in daylight if h["time"] + timedelta(hours=1) > now] if is_today else daylight)
        if is_today:
            # Whole-day score ignoring the clock: the best window and the
            # daylight mean over every hour of the date, gone or not.
            full = scoring.windows(hours, sun.get(d))
            full_top = max((scoring.summarise(w, spot.facing, spot.is_coastal)["score"] for w in full), default=None)
            score_full_day = _day_score(full_top, daylight)
            remaining_from = now.replace(minute=0, second=0, microsecond=0).isoformat()
        else:
            score_full_day, remaining_from = day_score, None
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
            # max over every hour of the date, so it is never below the hourly rows
            "gust_kn_max": _r(max([h["gust_kn"] for h in hours if h["gust_kn"] is not None], default=None)),
            "swell_m_avg": _r(_mean([h["swell_m"] for h in agg]), 2) if spot.is_coastal else None,
            "rain_mm": _r(sum(h["rain_mm"] or 0 for h in hours)),
            "sst_c_avg": _r(sst) if spot.is_coastal else None,
            "sunrise": sr.isoformat() if sr else None,
            "sunset": ss.isoformat() if ss else None,
            # additive
            "wave_m_avg": _r(_mean([h["wave_m"] for h in agg]), 2) if spot.is_coastal else None,
            "wind_kn_max": _r(max([h["wind_kn"] for h in hours if h["wind_kn"] is not None], default=None)),
            "gust_kn_max_daylight": _r(max([h["gust_kn"] for h in agg if h["gust_kn"] is not None], default=None)),
            "wind_kn_max_daylight": _r(max([h["wind_kn"] for h in agg if h["wind_kn"] is not None], default=None)),
            "label": day_label(d), "confidence": (best or top or {}).get("confidence", conf),
            "lead_confidence": conf, "verdict_text": verdict_text,
            "best_window": best, "best_window_text": best["advice"] if best else no_win,
            "windows": len(fishable), "no_window_reason": no_win, "least_bad_window": least,
            "moon": moon, "blocks_3h": blocks,
            # additive: which score to show for today (docs/OUTPUT.md)
            "score_remaining": day_score if is_today else None,
            "remaining_from": remaining_from, "score_full_day": score_full_day,
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
        # End of the current hour: after it, today's past-hour cut (score,
        # score_remaining, windows) is out of date, and the 1 h forecast cache
        # has refreshed too. Regenerate rather than show it past this time.
        "valid_until": (now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)).isoformat(),
        "model_run": model_run,
        "sources": sources,
        "verdict": _verdict(windows, least_bad_all, out_days, start),
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
        "cache": {"forecast": wx.get("_cache"), "marine": (marine or {}).get("_cache"), **cmp_cache},
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
