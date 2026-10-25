"""
Fetch weather and marine data from Open-Meteo (free, no key).
"""

import requests
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
import zoneinfo

NZ_TZ = zoneinfo.ZoneInfo("Pacific/Auckland")

# Open-Meteo forecast horizons (days from today, including today).
# The weather API accepts up to 16 days. The marine API also accepts 16, but
# wave/swell values are only populated for roughly the first 9-10 days and are
# null after that – summarise_conditions() handles those nulls.
MAX_FORECAST_DAYS = 16
MARINE_RELIABLE_DAYS = 9


def nz_today() -> date:
    return datetime.now(NZ_TZ).date()


def clamp_date_range(start: date, end: date, today: Optional[date] = None) -> Tuple[date, date, List[str]]:
    """
    Clamp a requested date range to what Open-Meteo can forecast.
    Returns (start, end, notes) where notes explain any adjustments.
    """
    today = today or nz_today()
    last = today + timedelta(days=MAX_FORECAST_DAYS - 1)
    notes: List[str] = []
    if end < start:
        start, end = end, start
        notes.append("Start date was after end date, so they were swapped.")
    if start < today:
        start = today
        notes.append("Past dates aren't forecast, so the range starts today.")
    if end > last:
        end = last
        notes.append(f"Forecasts only go out {MAX_FORECAST_DAYS} days, so the range ends {last:%a %d %b}.")
    if start > end:  # whole range was outside the forecast window
        start = end = min(max(start, today), last)
    if end > today + timedelta(days=MARINE_RELIABLE_DAYS - 1):
        notes.append(f"Swell forecasts only cover about the next {MARINE_RELIABLE_DAYS} days; "
                     "later days are scored on wind and rain only.")
    return start, end, notes


def _date_params(start: Optional[date], end: Optional[date], days: int) -> Dict[str, Any]:
    if start and end:
        return {"start_date": start.isoformat(), "end_date": end.isoformat()}
    return {"forecast_days": max(1, min(days, MAX_FORECAST_DAYS))}


def fetch_forecast(lat: float, lon: float, days: int = 5,
                   start: Optional[date] = None, end: Optional[date] = None) -> Dict[str, Any]:
    """Fetch hourly + daily weather forecast. Wind speeds are returned in knots."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "temperature_2m,precipitation,weathercode,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl",
        "daily": "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max",
        "wind_speed_unit": "kn",  # Open-Meteo defaults to km/h
        "timezone": "Pacific/Auckland",
        **_date_params(start, end, days),
    }
    r = requests.get(url, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def fetch_marine(lat: float, lon: float, days: int = 5,
                 start: Optional[date] = None, end: Optional[date] = None) -> Dict[str, Any]:
    """Fetch marine/wave data. Returns {} on failure (e.g. inland points)."""
    url = "https://marine-api.open-meteo.com/v1/marine"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,wind_wave_height",
        "daily": "wave_height_max,swell_wave_height_max",
        "timezone": "Pacific/Auckland",
        **_date_params(start, end, days),
    }
    try:
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}


def get_weekend_window() -> tuple[datetime, datetime]:
    """Return next Saturday 00:00 to Sunday 23:59 NZ time."""
    now = datetime.now(NZ_TZ)
    # Find next Saturday
    days_ahead = (5 - now.weekday()) % 7  # Saturday = 5
    if days_ahead == 0 and now.hour > 12:
        days_ahead = 7
    saturday = (now + timedelta(days=days_ahead)).replace(hour=0, minute=0, second=0, microsecond=0)
    sunday = saturday + timedelta(days=1, hours=23, minutes=59)
    return saturday, sunday


def _in_range(d: date, start: Optional[date], end: Optional[date]) -> bool:
    if start is None and end is None:
        return True
    if start is not None and d < start:
        return False
    if end is not None and d > end:
        return False
    return True


def _value(series: Optional[list], i: int):
    """Safe lookup: returns None for missing series, short series or null values."""
    if not series or i >= len(series):
        return None
    return series[i]


def summarise_conditions(weather: Dict, marine: Dict,
                         start: Optional[date] = None, end: Optional[date] = None) -> Dict[str, Any]:
    """
    Summarise conditions over the selected date range (inclusive).
    If no range is given, every hour returned by the API is used.
    Null values from the APIs (e.g. swell at inland/fjord points, or beyond
    the marine forecast horizon) are skipped rather than crashing.
    """
    if not weather:
        return {"error": "No weather data"}

    hourly = weather.get("hourly", {})
    times = hourly.get("time", [])

    wind_speeds, gusts, precip, pressures, wave_heights = [], [], [], [], []

    for i, t in enumerate(times):
        if not _in_range(datetime.fromisoformat(t).date(), start, end):
            continue
        for key, bucket in (("wind_speed_10m", wind_speeds), ("wind_gusts_10m", gusts),
                            ("precipitation", precip), ("pressure_msl", pressures)):
            v = _value(hourly.get(key), i)
            if v is not None:
                bucket.append(v)

    marine_hourly = marine.get("hourly", {}) if marine else {}
    m_times = marine_hourly.get("time", [])
    swell_series = marine_hourly.get("swell_wave_height")
    wave_series = marine_hourly.get("wave_height")
    marine_hours = 0
    for i, t in enumerate(m_times):
        if not _in_range(datetime.fromisoformat(t).date(), start, end):
            continue
        marine_hours += 1
        v = _value(swell_series, i)
        if v is None:
            v = _value(wave_series, i)  # fall back to combined sea state
        if v is not None:
            wave_heights.append(v)

    def avg(lst):
        return round(sum(lst) / len(lst), 1) if lst else None

    def max_val(lst):
        return round(max(lst), 1) if lst else None

    summary = {
        "avg_wind_kts": avg(wind_speeds),      # requested in knots (wind_speed_unit=kn)
        "max_gust_kts": max_val(gusts),
        "total_rain_mm": round(sum(precip), 1) if precip else 0,
        # Rain per day, so scores are comparable between a 2-day and a 7-day range
        "rain_mm_per_day": round(sum(precip) / max(1.0, len(precip) / 24), 1) if precip else 0,
        "avg_pressure": avg(pressures),
        "pressure_trend": "stable",
        "avg_swell_m": avg(wave_heights),
        "max_swell_m": max_val(wave_heights),
        # Fraction of the selected hours that have swell data (0 for inland points)
        "swell_coverage": round(len(wave_heights) / marine_hours, 2) if marine_hours else 0.0,
        "hours": len(wind_speeds),
        "raw_wind_kts": wind_speeds,
        "raw_swell": wave_heights,
    }

    if not wind_speeds and not precip:
        summary["error"] = "No forecast data for the selected dates"

    # Simple pressure trend (first third vs last third of the period)
    if len(pressures) > 4:
        third = len(pressures) // 3
        diff = sum(pressures[-third:]) / third - sum(pressures[:third]) / third
        if diff > 2:
            summary["pressure_trend"] = "rising"
        elif diff < -2:
            summary["pressure_trend"] = "falling"

    return summary
