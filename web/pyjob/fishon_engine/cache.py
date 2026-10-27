"""Small persistent HTTP cache (SQLite, stdlib only).

Why: a public, paid site must not call Open-Meteo once per page view. With
this cache every process/worker on the same host shares one SQLite file, the
cache survives restarts, and ``prefetch.py`` can warm it from cron so users
never wait on the upstream API.

* Per-entry TTL (forecast 1 h, marine 3 h, LINZ tide tables 30 days by default).
* Stale-if-error: if the upstream fails we serve the last good copy and flag it.
* Location: ``$FISHON_CACHE_DB`` or ``~/.cache/fishon/cache.sqlite``.

For multi-host deployments swap this for Redis/Postgres with the same
``get_json``/``get_text`` interface.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple

import requests

DEFAULT_PATH = os.environ.get(
    "FISHON_CACHE_DB", os.path.join(os.path.expanduser("~"), ".cache", "fishon", "cache.sqlite"))

_lock = threading.Lock()


class Cache:
    def __init__(self, path: str = DEFAULT_PATH):
        self.path = path
        if path != ":memory:":
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self._mem_conn = sqlite3.connect(":memory:", check_same_thread=False) if path == ":memory:" else None
        with self._conn() as c:
            if path != ":memory:":
                c.execute("PRAGMA journal_mode=WAL")
            c.execute("CREATE TABLE IF NOT EXISTS http_cache (key TEXT PRIMARY KEY, url TEXT, "
                      "body TEXT, fetched_at REAL, ttl REAL)")
        self.stats = {"hit": 0, "miss": 0, "stale": 0}

    def _conn(self) -> sqlite3.Connection:
        if self._mem_conn is not None:
            return self._mem_conn
        return sqlite3.connect(self.path, timeout=10)

    @staticmethod
    def key(url: str, params: Optional[Dict[str, Any]]) -> str:
        p = json.dumps(sorted((params or {}).items()), default=str)
        # never key on secrets
        p = p.replace(os.environ.get("OPEN_METEO_API_KEY", "\x00"), "<key>")
        return hashlib.sha256(f"{url}|{p}".encode()).hexdigest()

    def _read(self, key: str) -> Optional[Tuple[str, float, float]]:
        with _lock, self._conn() as c:
            row = c.execute("SELECT body, fetched_at, ttl FROM http_cache WHERE key=?", (key,)).fetchone()
        return row

    def _write(self, key: str, url: str, body: str, ttl: float) -> None:
        with _lock, self._conn() as c:
            c.execute("INSERT OR REPLACE INTO http_cache VALUES (?,?,?,?,?)",
                      (key, url, body, time.time(), ttl))

    def fetch(self, url: str, params: Optional[Dict[str, Any]], ttl: float,
              fetcher: Callable[[str, Optional[Dict[str, Any]]], str]) -> Tuple[str, Dict[str, Any]]:
        """Return (body, meta). meta = {"cache": "hit"|"miss"|"stale", "age_s": float}."""
        k = self.key(url, params)
        row = self._read(k)
        now = time.time()
        if row and now - row[1] < ttl:
            self.stats["hit"] += 1
            return row[0], {"cache": "hit", "age_s": round(now - row[1])}
        try:
            body = fetcher(url, params)
        except Exception as exc:  # stale-if-error
            if row:
                self.stats["stale"] += 1
                return row[0], {"cache": "stale", "age_s": round(now - row[1]), "error": str(exc)}
            raise
        self._write(k, url, body, ttl)
        self.stats["miss"] += 1
        return body, {"cache": "miss", "age_s": 0}

    def purge_expired(self, grace_s: float = 7 * 86400) -> int:
        with _lock, self._conn() as c:
            cur = c.execute("DELETE FROM http_cache WHERE fetched_at + ttl + ? < ?", (grace_s, time.time()))
            return cur.rowcount


UA = {"User-Agent": "SaltSupplyCo-engine/2.0 (+https://github.com/lebrun76-lab/FIsh-on-3)"}


def http_get_text(url: str, params: Optional[Dict[str, Any]] = None, timeout: float = 20) -> str:
    r = requests.get(url, params=params, timeout=timeout, headers=UA)
    r.raise_for_status()
    if "charset" not in r.headers.get("Content-Type", "").lower():
        r.encoding = "utf-8"   # LINZ CSVs are UTF-8 but sent without a charset
    return r.text


_default: Optional[Cache] = None


def default_cache() -> Cache:
    global _default
    if _default is None:
        _default = Cache()
    return _default


def set_default_cache(cache: Cache) -> None:
    global _default
    _default = cache
