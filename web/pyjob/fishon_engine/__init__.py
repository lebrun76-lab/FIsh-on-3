"""Fish On forecast engine 2.1.

Pure-Python package (only dependency: ``requests``) that the Streamlit app
or any other web front-end can call. Output is the site's v1 ``SpotForecast``
(see docs/OUTPUT.md; ``fishon_engine.contract.validate_v1`` checks it)::

    from fishon_engine import forecast_spot
    fc = forecast_spot("moeraki")            # next 7 days, Pacific/Auckland
    print(fc["verdict"]["headline"])
    for day in fc["days"]:
        print(day["label"], day["score"], day["rating"], day["best_window"]["advice"])

All datetimes are timezone-aware in Pacific/Auckland (NZST/NZDT).
"""
from .engine import forecast_spot, forecast_many  # noqa: F401
from .spots import SPOTS, get_spot  # noqa: F401

__all__ = ["forecast_spot", "forecast_many", "SPOTS", "get_spot"]
__version__ = "2.4.0"
