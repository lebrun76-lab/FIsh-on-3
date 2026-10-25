from datetime import date, datetime, timedelta

from fishon_engine import openmeteo
from fishon_engine.tz import NZ, UTC


def test_hourly_rows_across_dst_start():
    # NZ DST starts Sun 27 Sep 2026 02:00 NZST -> 03:00 NZDT (2am local never exists)
    t0 = datetime(2026, 9, 26, 12, tzinfo=UTC)  # 00:00 NZST 27 Sep
    ts = [int((t0 + timedelta(hours=i)).timestamp()) for i in range(5)]
    rows = openmeteo.hourly_rows({"hourly": {"time": ts, "wind_speed_10m": [1, 2, 3, None, 5]}})
    assert [r["time"].strftime("%H") for r in rows] == ["00", "01", "03", "04", "05"]
    assert rows[3]["wind_speed_10m"] is None


def test_api_key_switches_host(monkeypatch):
    monkeypatch.delenv("OPEN_METEO_API_KEY", raising=False)
    assert openmeteo._host("marine") == "https://marine-api.open-meteo.com/v1/marine"
    monkeypatch.setenv("OPEN_METEO_API_KEY", "k")
    assert openmeteo._host("forecast").startswith("https://customer-api.")
    assert openmeteo._params(-45, 170, date(2026, 1, 1), date(2026, 1, 2))["apikey"] == "k"


def test_variable_counts_stay_at_one_call():
    # Open-Meteo bills >10 variables as more than one call
    assert len(openmeteo.FORECAST_HOURLY) + len(openmeteo.FORECAST_DAILY) <= 10
    assert len(openmeteo.MARINE_HOURLY) <= 10
