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

SST_HISTORY_HOURLY = ["sea_surface_temperature"]           # 1 variable (2.6.0)
SST_HISTORY_DAYS = 3

FORECAST_TTL = 3600
SST_HISTORY_TTL = 12 * 3600
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
                   cache: Optional[Cache] = None, cell_selection: str = "land") -> Dict[str, Any]:
    """``cell_selection``: Open-Meteo's grid-cell preference. The API default
    ``land`` picks a land cell with similar elevation to the 90 m DEM height of
    the point; coastal spots pass ``sea`` so the model cell is over water
    (documented at https://open-meteo.com/en/docs, parameter cell_selection)."""
    extra = {"hourly": ",".join(FORECAST_HOURLY), "daily": ",".join(FORECAST_DAILY),
             "wind_speed_unit": "kn"}
    if cell_selection != "land":
        extra["cell_selection"] = cell_selection
    return _get(_host("forecast"), _params(lat, lon, start, end, **extra), FORECAST_TTL, cache)


def fetch_marine(lat: float, lon: float, start: date, end: date,
                 cache: Optional[Cache] = None) -> Dict[str, Any]:
    return _get(_host("marine"), _params(lat, lon, start, end,
                hourly=",".join(MARINE_HOURLY)), MARINE_TTL, cache)


# Model comparison for confidence (docs/CONFIDENCE.md). One extra request per
def fetch_sst_history(lat: float, lon: float, start: date,
                      cache: Optional[Cache] = None) -> Dict[str, Any]:
    """Sea temperature for the SST_HISTORY_DAYS days before ``start`` (2.6.0,
    for the warming/cooling trend). Same marine endpoint and cell as
    fetch_marine, one variable over 3 days, so it is one call; past days are
    Open-Meteo's archived forecasts, which change little, hence the 12 h TTL."""
    from datetime import timedelta
    s, e = start - timedelta(days=SST_HISTORY_DAYS), start - timedelta(days=1)
    return _get(_host("marine"), _params(lat, lon, s, e, hourly=",".join(SST_HISTORY_HOURLY)),
                SST_HISTORY_TTL, cache)


# spot on each host, each <=10 model-variables so it counts as one call:
# 3 wind models x 3 variables = 9; 3 wave models x 1 variable = 3. Open-Meteo
# returns one column per model, e.g. ``wind_speed_10m_gfs_seamless``.
# Model names checked live 2026-10-26 (icon_seamless ends ~7.5 days out; the
# 0.16 deg GFS wave grid has no data in NZ, so the 0.25 deg one is used).
COMPARE_WIND_MODELS = ["ecmwf_ifs025", "gfs_seamless", "icon_seamless"]
COMPARE_WIND_HOURLY = ["wind_speed_10m", "wind_gusts_10m", "wind_direction_10m"]
COMPARE_WAVE_MODELS = ["meteofrance_wave", "ecmwf_wam", "ncep_gfswave025"]
COMPARE_WAVE_HOURLY = ["wave_height"]
COMPARE_TTL = 3 * 3600


def fetch_wind_models(lat: float, lon: float, start: date, end: date, cache: Optional[Cache] = None,
                      cell_selection: str = "land") -> Dict[str, Any]:
    extra = {"hourly": ",".join(COMPARE_WIND_HOURLY), "models": ",".join(COMPARE_WIND_MODELS),
             "wind_speed_unit": "kn"}
    if cell_selection != "land":
        extra["cell_selection"] = cell_selection
    return _get(_host("forecast"), _params(lat, lon, start, end, **extra), COMPARE_TTL, cache)


def fetch_wave_models(lat: float, lon: float, start: date, end: date,
                      cache: Optional[Cache] = None) -> Dict[str, Any]:
    return _get(_host("marine"), _params(lat, lon, start, end, hourly=",".join(COMPARE_WAVE_HOURLY),
                                         models=",".join(COMPARE_WAVE_MODELS)), COMPARE_TTL, cache)


def model_columns(data: Optional[Dict[str, Any]], variables: List[str],
                  models: List[str]) -> Dict[str, Dict[Any, Dict[str, Any]]]:
    """{model: {nz_time: {variable: value}}} from a multi-model response."""
    out: Dict[str, Dict[Any, Dict[str, Any]]] = {}
    if not data:
        return out
    for row in hourly_rows(data):
        for m in models:
            vals = {v: row.get(f"{v}_{m}") for v in variables}
            out.setdefault(m, {})[row["time"]] = vals
    return out


# Model-run metadata. Open-Meteo publishes, per model, the initialisation time
# of the latest run it has ingested at /data/<model>/static/meta.json.
# best_match outside Europe/N. America/Japan uses the global models only
# (ECMWF IFS, NCEP GFS, DWD ICON; highest resolution wins per variable), so the
# 9 km ECMWF IFS HRES run is reported as ``model_run`` and the rest are listed.
FORECAST_MODELS = ["ecmwf_ifs", "ncep_gfs013", "dwd_icon"]
MARINE_MODELS = ["meteofrance_wave", "ecmwf_wam"]
META_TTL = 1800


def fetch_model_runs(cache: Optional[Cache] = None) -> Dict[str, Optional[str]]:
    """{model: ISO UTC initialisation time or None}. Never raises."""
    from datetime import datetime, timezone
    out: Dict[str, Optional[str]] = {}
    for kind, models in (("forecast", FORECAST_MODELS), ("marine", MARINE_MODELS)):
        base = "https://api.open-meteo.com" if kind == "forecast" else "https://marine-api.open-meteo.com"
        for m in models:
            try:
                body, _ = (cache or default_cache()).fetch(f"{base}/data/{m}/static/meta.json", {}, META_TTL,
                                                           http_get_text)
                t = json.loads(body)["last_run_initialisation_time"]
                out[m] = datetime.fromtimestamp(int(t), tz=timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
            except Exception:
                out[m] = None
    return out


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
