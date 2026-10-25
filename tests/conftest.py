import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FIX = os.path.join(os.path.dirname(__file__), "fixtures")

import json  # noqa: E402

import pytest  # noqa: E402
import requests  # noqa: E402

REAL = os.path.join(FIX, "real_2026-10-26")


@pytest.fixture(autouse=True)
def _offline(monkeypatch):
    """Tests never touch the network: any real HTTP request fails, and the
    Open-Meteo model-run metadata comes from a recorded fixture."""
    def no_net(*a, **k):
        raise RuntimeError("network disabled in tests")
    monkeypatch.setattr(requests.sessions.Session, "request", no_net)
    from fishon_engine import openmeteo
    with open(os.path.join(REAL, "model_runs.json")) as f:
        runs = json.load(f)
    monkeypatch.setattr(openmeteo, "fetch_model_runs", lambda cache=None: dict(runs))
