"""Moon phase (stdlib only) and sun-based bite windows.

Moon age uses the mean synodic month (29.530588853 days) counted from the
new moon of 2000-01-06 18:14 UTC. This mean-lunation method can be off by up to ~0.5-1 day versus the true phase, which is fine for
"near new/full moon" hints but not for almanac-grade timing.

Sunrise/sunset come from Open-Meteo's daily ``sunrise``/``sunset`` (the engine
does not compute them itself).

On "bite times": the dawn/dusk change-of-light bonus is long-standing angler
practice. Solunar (moon) effects on catch rates have weak scientific support,
so the moon only nudges the score slightly and the text says so.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

SYNODIC = 29.530588853
_REF_NEW = datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)

NAMES = [(1.0, "new moon"), (6.4, "waxing crescent"), (8.4, "first quarter"),
         (13.8, "waxing gibbous"), (15.8, "full moon"), (21.1, "waning gibbous"),
         (23.1, "last quarter"), (28.5, "waning crescent"), (29.6, "new moon")]


def moon_age(dt: datetime) -> float:
    days = (dt.astimezone(timezone.utc) - _REF_NEW).total_seconds() / 86400
    return days % SYNODIC


def moon_illumination(dt: datetime) -> float:
    return (1 - math.cos(2 * math.pi * moon_age(dt) / SYNODIC)) / 2


def moon_phase_name(dt: datetime) -> str:
    age = moon_age(dt)
    for limit, name in NAMES:
        if age < limit:
            return name
    return "new moon"


def days_from_new_or_full(dt: datetime) -> float:
    age = moon_age(dt)
    return min(age, abs(age - SYNODIC / 2), SYNODIC - age)


def moon_info(dt: datetime) -> dict:
    return {"phase": moon_phase_name(dt), "age_days": round(moon_age(dt), 1),
            "illumination_pct": round(100 * moon_illumination(dt)),
            "near_new_or_full": days_from_new_or_full(dt) <= 2.0}
