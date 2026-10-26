"""Cloud forecast refresh: Forecast Brain -> Supabase.

Cloud twin of jobs/run_forecasts.py (same site_payload mapping and SST payload,
MAPPER_VERSION kept in step). Differences: writes rows to Supabase over
PostgREST with the service key instead of local files, skips the SST PNG
(the site draws its own SVG map), and only rebuilds the SST map when the
newest stored one is older than SST_MIN_AGE_H, so the expensive batch call
(~663 Open-Meteo location-calls) runs at most 4 times a day.

A spot that fails gets a status='error' row and no payload, so the site keeps
showing that spot's last good forecast (latest_spot_forecasts only picks
status='ok'), or the committed file if there is none.

Env (names only): NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, optional SST_MIN_AGE_H, REFRESH_MIN_GAP_MIN,
OPEN_METEO_API_KEY (engine switches to the paid hosts; not set for the demo).
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# The engine opens its HTTP cache lazily at this path; on Vercel only /tmp is writable. run() restores
# it from Supabase Storage first (see Store) and saves it back at the end.
os.environ.setdefault("FISHON_CACHE_DB", "/tmp/fishon/cache.sqlite")
sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests  # noqa: E402

import fishon_engine as fe  # noqa: E402
from fishon_engine.tz import NZ  # noqa: E402

API_VERSION = "1"
MAPPER_VERSION = "2026-10-26.1"      # same mapping as jobs/run_forecasts.py (engine 2.4.0 output passes through)
DROP_TOP = {"cache"}
DROP_DAY = {"blocks_3h"}
DAYS = 10
TIME_BUDGET_S = 270                   # Vercel Hobby functions stop at 300 s
SST_GAP_S = 61                        # keep the SST batch out of the spots' minute (600 calls/min cap)


def site_payload(fc: dict) -> tuple[dict, list[str]]:
    """Engine output -> site payload (identical to jobs/run_forecasts.py for engine >= 2.1)."""
    if fc.get("api_version") != "1":
        raise RuntimeError(f"engine {fe.__version__} does not emit the v1 contract")
    from fishon_engine.contract import validate_v1
    v1 = {k: v for k, v in fc.items() if k not in DROP_TOP}
    v1["days"] = [{k: v for k, v in d.items() if k not in DROP_DAY} for d in fc["days"]]
    v1["mapper_version"] = MAPPER_VERSION
    return v1, validate_v1(fc)


def sst_payload() -> dict:
    """Same JSON as jobs/run_forecasts.py build_sst, without writing files or the PNG."""
    from fishon_engine import sstmap as sm
    grid = sm.fetch_grid()
    land = sm.load_land()
    iso = sm.isotherms(grid)
    spots = sm.coastal_spots()
    by_id = {r["spot"]: r for r in sm.spot_sst(grid, spots)}
    edges = {e["spot"]: e for e in sm.spot_edges(grid, spots)}
    per_spot = {}
    for sp in spots:
        near_iso = sorted({lev for lev, segs in iso.items()
                           if min(sm.haversine_km(sp.marine_lat, sp.marine_lon, y, x) for seg in segs for x, y in seg) <= 60},
                          reverse=True)
        e = edges.get(sp.id)
        r = by_id.get(sp.id, {})
        per_spot[sp.id] = {
            "sst_c": r.get("sst_c"), "cell_km": r.get("cell_km"),
            "marine_point": [sp.marine_lat, sp.marine_lon],
            "isotherms_near": near_iso,
            "edge": None if not e else {
                "min_c": e["min_c"], "max_c": e["max_c"], "delta_c": e["delta_c"],
                "warm_km": e["warm_km"], "warm_cell": e["warm_cell"],
                "warm_dir": sm.compass(sm.bearing_deg(sp.marine_lat, sp.marine_lon, *e["warm_cell"]))}}
    fronts = [{"text": n} for n in sm.notes(grid) if n.startswith("Temperature front")]
    return {
        "valid_time_nz": grid.get("valid_time_nz"), "valid_text": sm.nice_time(grid.get("valid_time_nz")),
        "bbox": grid["bbox"], "step": grid["step"], "lats": grid["lats"], "lons": grid["lons"],
        "sst": [[None if v is None else round(v, 1) for v in row] for row in grid["sst"]],
        "isotherms": {str(int(k)): [[[round(x, 2), round(y, 2)] for x, y in seg] for seg in segs] for k, segs in iso.items()},
        "land": [[[round(x, 3), round(y, 3)] for x, y in ring] for ring in land],
        "notes": sm.notes(grid), "fronts": fronts, "spots": per_spot,
        "api_calls_counted": grid.get("api_calls_counted"), "requests": grid.get("requests"),
        "cache": [m.get("cache") for m in grid.get("cache") or []],
        "attribution": sm.ATTRIBUTION, "caveats": [
            "0.5° grid (~55 km): shows regional water masses and fronts, not rips or tide lines.",
            "Shallow bays can read warmer than the open sea (e.g. Firth of Thames, Tasman Bay)."],
    }


class Rest:
    """Minimal PostgREST client with the service key (never logged)."""

    def __init__(self):
        url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("Supabase URL or service key is not set")
        self.base = url.rstrip("/") + "/rest/v1/"
        # sb_secret_ keys go on apikey only; a legacy service_role JWT also goes on Authorization.
        self.h = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):
            self.h["Authorization"] = f"Bearer {key}"
        self.s = requests.Session()

    def _ok(self, r):
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase {r.request.method} {r.url.split('?')[0].rsplit('/', 1)[-1]}: {r.status_code} {r.text[:300]}")
        return r

    def get(self, table, params):
        return self._ok(self.s.get(self.base + table, params=params, headers=self.h, timeout=20)).json()

    def insert(self, table, row):
        self._ok(self.s.post(self.base + table, data=json.dumps(row, ensure_ascii=False, default=str),
                             headers={**self.h, "Prefer": "return=minimal"}, timeout=30))

    def update(self, table, match, row):
        self._ok(self.s.patch(self.base + table, params=match, data=json.dumps(row, default=str),
                              headers={**self.h, "Prefer": "return=minimal"}, timeout=20))


def _age_h(ts: str | None) -> float:
    if not ts:
        return 1e9
    return (datetime.now(timezone.utc) - datetime.fromisoformat(ts.replace("Z", "+00:00"))).total_seconds() / 3600


def _nz_iso(ts: str | None) -> str | None:
    """Engine NZ wall time ('2026-10-26T17:00') -> ISO with its NZ offset, so Postgres stores the right instant."""
    if not ts:
        return ts
    d = datetime.fromisoformat(ts)
    return (d if d.tzinfo else d.replace(tzinfo=NZ)).isoformat()


# ------------------------------------------------------------ HTTP cache kept in Supabase Storage
CACHE_BUCKET = os.environ.get("ENGINE_CACHE_BUCKET", "engine-cache")   # private bucket, created on first save
CACHE_OBJECT = "fishon-cache.sqlite.gz"


class Store:
    """Supabase Storage (service key). Keeps the engine's SQLite HTTP cache between runs, because Vercel's
    /tmp does not survive: LINZ tide tables (30 d), SST (12 h), marine/model comparison (3 h) stay warm
    and the engine can serve a stale copy if Open-Meteo or LINZ fails (stale-if-error)."""

    def __init__(self, rest: Rest):
        self.base = rest.base.replace("/rest/v1/", "/storage/v1/")
        self.h = {k: v for k, v in rest.h.items() if k != "Content-Type"}
        self.s = rest.s

    def restore(self, path: str) -> dict:
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return {"cache": "warm instance"}
        import gzip
        r = self.s.get(f"{self.base}object/{CACHE_BUCKET}/{CACHE_OBJECT}", headers=self.h, timeout=30)
        if r.status_code != 200:
            return {"cache": "cold", "why": f"no saved cache ({r.status_code})"}
        os.makedirs(os.path.dirname(path), exist_ok=True)
        for x in ("-wal", "-shm"):
            if os.path.exists(path + x):
                os.remove(path + x)
        raw = gzip.decompress(r.content)
        with open(path, "wb") as f:
            f.write(raw)
        return {"cache": "restored", "kb": round(len(raw) / 1024)}

    def save(self, path: str) -> dict:
        import gzip
        import sqlite3
        from fishon_engine import cache as fe_cache
        fe_cache.default_cache().purge_expired()          # drop entries 7 days past their TTL
        tmp = path + ".snapshot"
        if os.path.exists(tmp):
            os.remove(tmp)
        src = sqlite3.connect(path, timeout=10)
        dst = sqlite3.connect(tmp)
        src.backup(dst)                                   # consistent copy including the WAL
        src.close()
        dst.execute("PRAGMA journal_mode=DELETE")
        dst.execute("VACUUM")
        dst.close()
        with open(tmp, "rb") as f:
            body = gzip.compress(f.read(), 6)
        os.remove(tmp)
        url = f"{self.base}object/{CACHE_BUCKET}/{CACHE_OBJECT}"
        h = {**self.h, "Content-Type": "application/gzip", "x-upsert": "true"}
        r = self.s.post(url, data=body, headers=h, timeout=60)
        if r.status_code >= 300 and "not found" in r.text.lower():
            self.s.post(self.base + "bucket", json={"id": CACHE_BUCKET, "name": CACHE_BUCKET, "public": False},
                        headers=self.h, timeout=20)
            r = self.s.post(url, data=body, headers=h, timeout=60)
        if r.status_code >= 300:
            raise RuntimeError(f"Storage upload {r.status_code} {r.text[:200]}")
        return {"saved_kb_gz": round(len(body) / 1024)}


def _model_runs_unchanged(db: Rest, current: dict | None) -> tuple[bool, str]:
    """True when every model's run time equals the last complete run's (stored in forecast_runs.notes and
    in each payload's model_runs), and that run is recent enough that the pages won't look stale."""
    if not current or any(v is None for v in current.values()):
        return False, "model run times unknown"
    rows = db.get("forecast_runs", {"select": "started_at,notes", "status": "eq.ok",
                                    "spots_ok": f"gte.{len(fe.SPOTS)}",   # full runs only, not a few-spot test
                                    "order": "started_at.desc", "limit": "1"})
    if not rows:
        return False, "no complete run yet"
    prev = (rows[0].get("notes") or {}).get("model_runs")
    age = _age_h(rows[0]["started_at"])
    max_h = float(os.environ.get("MAX_SKIP_H", "4.5"))  # pages call a forecast "a bit behind" after 6 h
    if prev != current:
        return False, "new model run"
    if age >= max_h:
        return False, f"last full run {age:.1f} h old (max skip {max_h} h)"
    return True, f"model runs unchanged since the run {age:.1f} h ago"


def run(force: bool = False, trigger: str = "http", spots: list[str] | None = None, sst: str = "auto") -> dict:
    """Run one refresh. Returns a summary dict (no secrets). sst: auto | yes | no."""
    t0 = time.monotonic()
    db = Rest()
    last = db.get("forecast_runs", {"select": "id,started_at,status", "order": "started_at.desc", "limit": "1"})
    gap_min = float(os.environ.get("REFRESH_MIN_GAP_MIN", "45"))
    if last and not force:
        age_min = _age_h(last[0]["started_at"]) * 60
        if age_min < gap_min or (last[0]["status"] == "running" and age_min < 10):
            return {"skipped": True, "reason": f"last run started {age_min:.0f} min ago (min gap {gap_min:.0f} min)",
                    "last_run": last[0]}

    store = Store(db)
    cache_path = os.environ["FISHON_CACHE_DB"]
    try:
        cache_info = store.restore(cache_path)
    except Exception as e:  # a cold cache only costs a few extra calls
        cache_info = {"cache": "cold", "why": f"{type(e).__name__}: {str(e)[:200]}"}
    from fishon_engine import cache as fe_cache
    from fishon_engine import openmeteo as fe_om
    fe_cache.default_cache()
    kw, model_run = {}, None
    kw["model_runs"] = fe_om.fetch_model_runs()        # 5 small GETs, shared by all spots; never raises
    if not force and not spots:
        same, why = _model_runs_unchanged(db, kw["model_runs"])
        if same:
            return {"skipped": True, "reason": why, "model_runs": kw["model_runs"], "cache": cache_info}

    run_id = str(uuid.uuid4())
    started = datetime.now(NZ).isoformat(timespec="seconds")
    db.insert("forecast_runs", {"id": run_id, "started_at": started, "engine_version": fe.__version__,
                                "mapper_version": MAPPER_VERSION, "days": DAYS, "status": "running"})
    ids = spots or sorted(fe.SPOTS)
    if not spots:  # stalest first, so a run cut short by the time budget refreshes different spots next time
        latest = {r["spot_id"]: r["generated_at"] or "" for r in
                  db.get("latest_spot_forecasts", {"select": "spot_id,generated_at"})}
        ids.sort(key=lambda sid: (latest.get(sid, ""), sid))
    ok, failed, problems, skipped = [], {}, {}, []
    last_call = time.monotonic()
    for i, sid in enumerate(ids):        # one spot at a time: ~4 Open-Meteo requests each, well under 600/min
        if time.monotonic() - t0 > TIME_BUDGET_S - 60:   # leave room for the SST map, cache save and writes
            skipped = ids[i:]
            break
        try:
            fc = fe.forecast_spot(sid, days=DAYS, **kw)
            last_call = time.monotonic()
            v1, probs = site_payload(fc)
            if probs:
                problems[sid] = probs[:20]
            v1["run_id"] = run_id
            db.insert("spot_forecasts", {
                "run_id": run_id, "spot_id": sid, "api_version": API_VERSION, "generated_at": v1["generated_at"],
                "valid_from": v1["days"][0]["date"], "valid_to": v1["days"][-1]["date"], "status": "ok",
                "tide_source": v1.get("tide_source"), "payload": v1})
            ok.append(sid)
            model_run = model_run or v1.get("model_run")
            print(f"ok   {sid} best {v1['verdict']['score']}")
        except Exception as e:  # keep going; the site keeps this spot's last real payload (latest ok row)
            last_call = time.monotonic()
            failed[sid] = f"{type(e).__name__}: {str(e)[:300]}"
            print(f"FAIL {sid}: {failed[sid]}", file=sys.stderr)
            traceback.print_exc(limit=2)
            try:
                db.insert("spot_forecasts", {"run_id": run_id, "spot_id": sid, "api_version": API_VERSION,
                                             "status": "error", "error": failed[sid]})
            except Exception as e2:
                print(f"could not record failure for {sid}: {e2}", file=sys.stderr)

    sst_info = None
    if sst != "no":
        newest = db.get("sst_maps", {"select": "created_at,valid_time", "order": "created_at.desc", "limit": "1"})
        age = _age_h(newest[0]["created_at"]) if newest else 1e9
        min_age = float(os.environ.get("SST_MIN_AGE_H", "5.5"))
        if sst == "yes" or age >= min_age:
            wait = max(0.0, SST_GAP_S - (time.monotonic() - last_call)) if ids else 0.0
            if time.monotonic() - t0 + wait > TIME_BUDGET_S - 40:
                sst_info = {"skipped": "not enough time left in this run"}
            else:
                time.sleep(wait)
                try:
                    p = sst_payload()
                    db.insert("sst_maps", {"run_id": run_id, "valid_time": _nz_iso(p["valid_time_nz"]), "step_deg": p["step"],
                                           "api_calls": int(p.get("api_calls_counted") or 0), "payload": p})
                    sst_info = {"valid_time_nz": p["valid_time_nz"], "api_calls_counted": p.get("api_calls_counted")}
                    print(f"sst  map valid {p['valid_text']}, {p.get('api_calls_counted')} calls counted")
                except Exception as e:  # site keeps the previous map
                    failed["sst_map"] = f"{type(e).__name__}: {str(e)[:300]}"
                    print(f"FAIL sst map: {failed['sst_map']}", file=sys.stderr)
        else:
            sst_info = {"skipped": f"newest map is {age:.1f} h old (refresh every {min_age} h)"}

    try:
        cache_info.update(store.save(cache_path))
    except Exception as e:
        cache_info["save_error"] = f"{type(e).__name__}: {str(e)[:200]}"
    cache_info["stats"] = dict(fe_cache.default_cache().stats)

    for sid in skipped:
        failed[sid] = "not run: time budget"
    status = "ok" if not failed else ("partial" if ok else "failed")
    finished = datetime.now(NZ).isoformat(timespec="seconds")
    notes = {"trigger": trigger, "failed": failed, "contract_problems": problems, "model_run": model_run,
             "model_runs": kw.get("model_runs"), "sst_map": sst_info, "cache": cache_info,
             "seconds": round(time.monotonic() - t0, 1),
             "open_meteo_tier": "customer (API key set)" if os.environ.get("OPEN_METEO_API_KEY") else "free (non-commercial)"}
    db.update("forecast_runs", {"id": f"eq.{run_id}"},
              {"finished_at": finished, "spots_ok": len(ok), "spots_failed": len([k for k in failed if k != "sst_map"]),
               "status": status, "notes": notes})
    return {"run_id": run_id, "status": status, "started_at": started, "finished_at": finished,
            "engine_version": fe.__version__, "spots_ok": len(ok), "spots_failed": failed,
            "sst_map": sst_info, "model_run": model_run, "cache": cache_info, "seconds": notes["seconds"]}


if __name__ == "__main__":  # local test: python pyjob/refresh.py [--force] [--no-sst] [spot ...]
    a = sys.argv[1:]
    print(json.dumps(run(force="--force" in a, trigger="cli", sst="no" if "--no-sst" in a else "auto",
                         spots=[x for x in a if not x.startswith("--")] or None), indent=1))
