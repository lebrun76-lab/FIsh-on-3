import os

import pytest

from fishon_engine.cache import Cache


def test_hit_miss_stale(tmp_path, monkeypatch):
    c = Cache(str(tmp_path / "c.sqlite"))
    calls = []

    def f(url, params):
        calls.append(1)
        return "body%d" % len(calls)

    assert c.fetch("u", {"a": 1}, 100, f) == ("body1", {"cache": "miss", "age_s": 0})
    assert c.fetch("u", {"a": 1}, 100, f)[1]["cache"] == "hit"
    assert len(calls) == 1
    body, meta = c.fetch("u", {"a": 1}, 0, lambda *_: (_ for _ in ()).throw(IOError("down")))
    assert body == "body1" and meta["cache"] == "stale"
    with pytest.raises(IOError):
        c.fetch("other", None, 0, lambda *_: (_ for _ in ()).throw(IOError("down")))


def test_shared_across_instances(tmp_path):
    p = str(tmp_path / "c.sqlite")
    Cache(p).fetch("u", None, 100, lambda *_: "x")
    assert Cache(p).fetch("u", None, 100, lambda *_: "y") [0] == "x"


def test_key_ignores_api_key(monkeypatch):
    monkeypatch.setenv("OPEN_METEO_API_KEY", "SECRET123")
    k1 = Cache.key("u", {"apikey": "SECRET123", "x": 1})
    assert "SECRET123" not in k1
