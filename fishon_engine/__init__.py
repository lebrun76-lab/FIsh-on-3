"""Fish On forecast engine v2.

Pure-Python package (only dependency: ``requests``) that the Streamlit app
or any other web front-end can call::

    from fishon_engine import forecast_spot
    fc = forecast_spot("moeraki")            # next 7 days, Pacific/Auckland
    for day in fc["days"]:
        print(day["label"], day["score"], day["best_window"]["text"])

All datetimes are timezone-aware in Pacific/Auckland (NZST/NZDT).
"""
from .engine import forecast_spot, forecast_many  # noqa: F401
from .spots import SPOTS, get_spot  # noqa: F401

__all__ = ["forecast_spot", "forecast_many", "SPOTS", "get_spot"]
__version__ = "2.0.0a1"
