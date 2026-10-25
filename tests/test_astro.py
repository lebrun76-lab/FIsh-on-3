from datetime import datetime

from fishon_engine import astro
from fishon_engine.tz import NZ


def test_full_moon_oct_2026():
    # RASNZ / timeanddate: full moon Mon 26 Oct 2026 ~5:12pm NZDT
    t = datetime(2026, 10, 26, 17, 12, tzinfo=NZ)
    assert astro.moon_illumination(t) > 0.99
    assert astro.moon_phase_name(t) == "full moon"
    assert astro.moon_info(t)["near_new_or_full"]


def test_new_moon_reference():
    t = datetime(2000, 1, 7, 7, 14, tzinfo=NZ)  # 2000-01-06 18:14 UTC
    assert astro.moon_age(t) < 0.01 and astro.moon_phase_name(t) == "new moon"
