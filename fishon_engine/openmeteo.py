"""Open-Meteo Forecast + Marine client.

Licensing: Open-Meteo data is CC BY 4.0 (attribution required). The free
endpoints (api.open-meteo.com / marine-api.open-meteo.com) are for
NON-COMMERCIAL use only. A paid public site needs a commercial plan; set
``OPEN_METEO_API_KEY`` and this module switches to the ``customer-`` hosts
automatically. Pricing checked 2026-10-25 at https://open-meteo.com/en/pricing:
API Standard EUR 29/month (1M calls), API Professional EUR 99/month (5M calls).

Call counting: Open-Meteo counts a request with >10 variables or >2 weeks as
more than one call, so each request below is kept to <=10 variables and
<=14 days.
"""
from __future__ import annotations

import json
import os
from datetime import date
from typing import Any, Dict, List, Optional

from .cache import Cache, default_cache, http_get_text
from .tz import utc_unix_to_nz

FORECAST_HOURLY = ["temperature_2m", "precipitation", "cloud_cover", "wind_speed_10m",
                   "wind_direction_10m", "wind_gusts_10m", "pressure_msl"]
FORECAST_DAILY = ["sunrise", "sunset"]                      # 9 variables total
MARINE_HOURLY = ["wave_height", "swell_wave_height", "swell_wave_period",
                 "swell_wave_direction", "wind_wave_height", "sea_surface_temperature",
                 "sea_level_height_msl"]                     # 7 variables total

FORECAST_TTL = 3600
MARINE_TTL = 3 * 3600
MAX_DAYS = 14


def _host(kind: str) -> str:
    key = os.environ.get("OPEN_METEO_API_KEY")
    if kind == "forecast":
        return ("https://customer-api.open-meteo.com/v1/forecast" if key
                else "https://api.open-meteo.com/v1/forecast")
    return ("https://customer-marine-api.open-meteo.com/v1/marine" if key
            else "https://marine-api.open-meteo.com/v1/marine")


def _params(lat: float, lon: float, start: date, end: date, **extra) -> Dict[str, Any]:
    p = {"latitude": round(lat, 3), "longitude": round(lon, 3),
         "start_date": start.isoformat(), "end_date": end.isoformat(),
         "timezone": "Pacific/Auckland", "timeformat": "unixtime"}
    p.update(extra)
    key = os.environ.get("OPEN_METEO_API_KEY")
    if key:
        p["apikey"] = key
    return p


def _get(url: str, params: Dict[str, Any], ttl: float, cache: Optional[Cache]) -> Dict[str, Any]:
    body, meta = (cache or default_cache()).fetch(url, params, ttl, http_get_text)
    data = json.loads(body)
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(f"Open-Meteo error: {data.get('reason')}")
    data["_cache"] = meta
    return data


def fetch_forecast(lat: float, lon: float, start: date, end: date,
                   cache: Optional[Cache] = None) -> Dict[str, Any]:
    return _get(_host("forecast"), _params(lat, lon, start, end,
                hourly=",".join(FORECAST_HOURLY), daily=",".join(FORECAST_DAILY),
                wind_speed_unit="kn"), FORECAST_TTL, cache)


def fetch_marine(lat: float, lon: float, start: date, end: date,
                 cache: Optional[Cache] = None) -> Dict[str, Any]:
    return _get(_host("marine"), _params(lat, lon, start, end,
                hourly=",".join(MARINE_HOURLY)), MARINE_TTL, cache)


def hourly_rows(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Turn Open-Meteo column arrays into a list of per-hour dicts with an
    aware NZ datetime under 'time'. Missing variables become None."""
    h = (data or {}).get("hourly") or {}
    times = h.get("time") or []
    rows = []
    for i, ts in enumerate(times):
        row = {"time": utc_unix_to_nz(ts)}
        for k, v in h.items():
            if k != "time":
                row[k] = v[i] if i < len(v) else None
        rows.append(row)
    return rows


def daily_sun(data: Dict[str, Any]) -> Dict[date, Dict[str, Any]]:
    d = (data or {}).get("daily") or {}
    out = {}
    for i, ts in enumerate(d.get("time") or []):
        day = utc_unix_to_nz(ts).date()
        sr = (d.get("sunrise") or [None] * (i + 1))[i]
        ss = (d.get("sunset") or [None] * (i + 1))[i]
        out[day] = {"sunrise": utc_unix_to_nz(sr) if sr else None,
                    "sunset": utc_unix_to_nz(ss) if ss else None}
    return out
