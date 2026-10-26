"""Wind direction relative to the coast."""
from __future__ import annotations

from typing import Optional

COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
           "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
COMPASS8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def compass(deg: Optional[float], points: int = 8) -> str:
    if deg is None:
        return "?"
    names = COMPASS8 if points == 8 else COMPASS
    step = 360 / len(names)
    return names[int(((deg % 360) + step / 2) // step) % len(names)]


def angle_diff(a: float, b: float) -> float:
    """Smallest absolute angle between two bearings (0..180)."""
    d = abs((a - b) % 360)
    return 360 - d if d > 180 else d


def relative_to_coast(wind_from: Optional[float], facing: Optional[float]) -> Optional[str]:
    """Classify wind as 'onshore', 'cross-onshore', 'cross-shore',
    'cross-offshore' or 'offshore'.

    ``wind_from`` is the meteorological direction (where the wind comes FROM,
    as returned by Open-Meteo ``wind_direction_10m``). ``facing`` is the
    bearing the shore faces out to sea. Wind coming from the sea (from
    ``facing``) is onshore.
    """
    if wind_from is None or facing is None:
        return None
    d = angle_diff(wind_from, facing)
    if d <= 30:
        return "onshore"
    if d <= 67.5:
        return "cross-onshore"
    if d < 112.5:
        return "cross-shore"
    if d < 150:
        return "cross-offshore"
    return "offshore"


def strength_word(kn: Optional[float]) -> str:
    if kn is None:
        return "unknown wind"
    if kn < 6:
        return "light"
    if kn < 11:
        return "gentle"
    if kn < 17:
        return "moderate"
    if kn < 22:
        return "fresh"
    if kn < 28:
        return "strong"
    return "gale-force"
