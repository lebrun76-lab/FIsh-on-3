"""
Fetch weather and marine data from Open-Meteo (free, no key).
"""

import requests
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import zoneinfo

def fetch_forecast(lat: float, lon: float, days: int = 5) -> Dict[str, Any]:
    """Fetch hourly + daily weather forecast."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "temperature_2m,precipitation,weathercode,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl",
        "daily": "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max",
        "timezone": "Pacific/Auckland",
        "forecast_days": days,
    }
    r = requests.get(url, params=params, timeout=15)
    r.raise_for_status()
    return r.json()

def fetch_marine(lat: float, lon: float, days: int = 5) -> Dict[str, Any]:
    """Fetch marine/wave data."""
    url = "https://marine-api.open-meteo.com/v1/marine"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,wind_wave_height",
        "daily": "wave_height_max,swell_wave_height_max",
        "timezone": "Pacific/Auckland",
        "forecast_days": days,
    }
    try:
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}

def get_weekend_window() -> tuple[datetime, datetime]:
    """Return next Saturday 00:00 to Sunday 23:59 NZ time."""
    nz = zoneinfo.ZoneInfo("Pacific/Auckland")
    now = datetime.now(nz)
    # Find next Saturday
    days_ahead = (5 - now.weekday()) % 7  # Saturday = 5
    if days_ahead == 0 and now.hour > 12:
        days_ahead = 7
    saturday = (now + timedelta(days=days_ahead)).replace(hour=0, minute=0, second=0, microsecond=0)
    sunday = saturday + timedelta(days=1, hours=23, minutes=59)
    return saturday, sunday

def summarise_conditions(weather: Dict, marine: Dict, target_days: List[str] = None) -> Dict[str, Any]:
    """
    Produce a clean summary focused on weekend usability.
    Returns dict with wind, swell, rain, pressure trend, overall score etc.
    """
    if not weather:
        return {"error": "No weather data"}

    hourly = weather.get("hourly", {})
    daily = weather.get("daily", {})
    times = hourly.get("time", [])
    
    # Simple aggregates for Sat + Sun
    wind_speeds = []
    gusts = []
    precip = []
    pressures = []
    wave_heights = []

    marine_hourly = marine.get("hourly", {}) if marine else {}
    m_times = marine_hourly.get("time", [])
    m_waves = marine_hourly.get("swell_wave_height") or marine_hourly.get("wave_height") or []

    for i, t in enumerate(times):
        dt = datetime.fromisoformat(t)
        if dt.weekday() in (5, 6):  # Sat or Sun
            if hourly.get("wind_speed_10m"):
                wind_speeds.append(hourly["wind_speed_10m"][i])
            if hourly.get("wind_gusts_10m"):
                gusts.append(hourly["wind_gusts_10m"][i])
            if hourly.get("precipitation"):
                precip.append(hourly["precipitation"][i])
            if hourly.get("pressure_msl"):
                pressures.append(hourly["pressure_msl"][i])

    for i, t in enumerate(m_times):
        dt = datetime.fromisoformat(t)
        if dt.weekday() in (5, 6) and i < len(m_waves):
            wave_heights.append(m_waves[i])

    def avg(lst):
        return round(sum(lst) / len(lst), 1) if lst else None

    def max_val(lst):
        return round(max(lst), 1) if lst else None

    summary = {
        "avg_wind_kts": avg(wind_speeds),          # Open-Meteo is m/s → convert later
        "max_gust_kts": max_val(gusts),
        "total_rain_mm": round(sum(precip), 1) if precip else 0,
        "avg_pressure": avg(pressures),
        "pressure_trend": "stable",
        "avg_swell_m": avg(wave_heights),
        "max_swell_m": max_val(wave_heights),
        "raw_wind_ms": wind_speeds,
        "raw_swell": wave_heights,
    }

    # Convert m/s to knots (1 m/s ≈ 1.94384 kn)
    if summary["avg_wind_kts"] is not None:
        summary["avg_wind_kts"] = round(summary["avg_wind_kts"] * 1.94384, 1)
    if summary["max_gust_kts"] is not None:
        summary["max_gust_kts"] = round(summary["max_gust_kts"] * 1.94384, 1)

    # Simple pressure trend
    if pressures and len(pressures) > 4:
        early = sum(pressures[:len(pressures)//3]) / (len(pressures)//3)
        late = sum(pressures[-len(pressures)//3:]) / (len(pressures)//3)
        diff = late - early
        if diff > 2:
            summary["pressure_trend"] = "rising"
        elif diff < -2:
            summary["pressure_trend"] = "falling"
        else:
            summary["pressure_trend"] = "stable"

    return summary
