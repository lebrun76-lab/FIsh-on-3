"""Item 4: weather points moved to water; shore bearings and display
coordinates must not change."""
import os
import re

import pytest

from fishon_engine import sstmap
from fishon_engine.spots import SPOTS, WX_POINTS

# (facing, lat, lon) at commit 54ae5da (PR #4) - must stay identical.
BASE = {'bay_of_islands': (45, -35.25, 174.12), 'bay_of_plenty': (10, -37.7, 176.5), 'coromandel': (270, -36.75, 175.5), 'east_cape': (20, -37.7, 178.5), 'far_north': (80, -34.8, 173.1), 'hauraki_gulf': (60, -36.7, 175.0), 'hawkes_bay': (100, -39.5, 176.9), 'taranaki': (330, -39.06, 174.07), 'wellington': (180, -41.29, 174.78), 'banks_peninsula': (150, -43.8, 172.95), 'bluff': (180, -46.6, 168.33), 'catlins': (135, -46.55, 169.45), 'central_otago_lakes': (None, -44.7, 169.15), 'dunedin': (120, -45.87, 170.5), 'fiordland': (260, -44.67, 167.93), 'greymouth': (300, -42.45, 171.21), 'haast_jackson': (310, -43.9, 168.9), 'kaikoura': (120, -42.4, 173.68), 'marlborough_sounds': (30, -41.2, 174.0), 'moeraki': (90, -45.36, 170.86), 'nelson_bays': (0, -41.0, 173.2), 'southern_lakes': (None, -45.4, 167.7), 'stewart_island': (80, -46.9, 168.13)}  # noqa: E501


def test_bearings_and_display_coords_unchanged():
    assert {k: (s.facing, s.lat, s.lon) for k, s in SPOTS.items()} == BASE


@pytest.fixture(scope="module")
def land():
    return sstmap.load_land()


@pytest.mark.parametrize("sid", sorted(WX_POINTS))
def test_weather_points_are_at_sea_and_close(sid, land):
    s = SPOTS[sid]
    assert s.is_coastal
    assert not sstmap.is_land(s.forecast_lat, s.forecast_lon, land)
    assert sstmap.haversine_km(s.lat, s.lon, s.forecast_lat, s.forecast_lon) < 25
    assert "sea point" in s.wx_note


def test_others_fall_back_to_display_coords():
    for k, s in SPOTS.items():
        if k not in WX_POINTS:
            assert (s.forecast_lat, s.forecast_lon) == (s.lat, s.lon) and s.wx_note == ""


def test_pyproject_version_matches():
    import fishon_engine
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    txt = open(os.path.join(root, "pyproject.toml")).read()
    assert re.search(r'version\s*=\s*\{\s*attr\s*=\s*"fishon_engine.__version__"', txt)
    assert fishon_engine.__version__ == "2.1.0"
