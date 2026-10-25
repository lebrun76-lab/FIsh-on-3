#!/usr/bin/env python3
"""Salt Supply Co. scheduled forecast job (local prototype runner).

Runs Forecast Brain (``fishon_engine``, read-only clone of PR #5 branch
feat/site-feedback at /workspace/fish-engine-site, installed with
``pip install -e`` - never edited) for every spot. Engine >= 2.1 emits the v1
contract itself, so this is a pass-through plus validation; engine 2.0 output
is still mapped by ``legacy_to_v1``. Output goes to the site's v1 contract
(web/src/lib/types.ts, web/docs/forecast-api.md) and writes Supabase-shaped
records to local storage:

  web/data/saltsupply.sqlite            rows for the tables in
                                        supabase/migrations/20261025000000_forecasts.sql
                                        (forecast_runs, spot_forecasts, tide_events)
  web/data/forecasts/latest/<id>.json   v1 SpotForecast payload (= spot_forecasts.payload)
  web/data/forecasts/manifest.json      the latest forecast_runs row
  web/data/sst/latest.json              NZ SST map for the site (= sst_maps.payload)
  web/public/sst/sst_latest.png         engine-rendered PNG of the same grid

The Next.js site reads the JSON export server-side. In production the same
mapping runs in a cron job and upserts into Supabase Postgres instead.

A spot whose engine call fails is recorded as status='error' and NO payload is
written, so the site shows its clearly labelled mock fallback for that spot.

Usage:
  jobs/.venv/bin/python jobs/run_forecasts.py [--days 10] [--spots a b ...]
Env (names only): FISHON_CACHE_DB (engine HTTP cache path),
OPEN_METEO_API_KEY (optional; engine switches to the paid hosts).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
import sys
import traceback
import uuid
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "web" / "data"
ENGINE_PATH = os.environ.get("FISHON_ENGINE_PATH", "/workspace/fish-engine-site")
if ENGINE_PATH not in sys.path and Path(ENGINE_PATH, "fishon_engine").is_dir():
    sys.path.append(ENGINE_PATH)  # fallback if the venv .pth is missing

import fishon_engine as fe  # noqa: E402
from fishon_engine import tides as fe_tides  # noqa: E402
from fishon_engine.tz import NZ  # noqa: E402

API_VERSION = "1"
MAPPER_VERSION = "2026-10-26.1"
# Engine fields the site does not need (kept out of the public payload; the
# full engine output still goes to spot_forecasts.engine_payload).
DROP_TOP = {"cache"}
DROP_DAY = {"blocks_3h"}   # 3-hourly blocks kept by the engine for the Streamlit app


# ---------------------------------------------------------------- helpers
def rating(score):
    """Engine verdict bands -> v1 Rating. Engine has 5 bands
    (Excellent>=7.5, Good>=6, Fair>=4.5, Marginal>=3, Poor); v1 has 4.
    Engine 'Marginal' and 'Poor' both map to v1 'poor'."""
    if score is None:
        return "poor"
    if score >= 7.5:
        return "great"
    if score >= 6:
        return "good"
    if score >= 4.5:
        return "marginal"
    return "poor"


def mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 1) if xs else None


def r1(x):
    return None if x is None else round(float(x), 1)


def hour_of(iso):
    return int(iso[11:13])


def is_daylightish(block, day):
    """Blocks overlapping sunrise..sunset (what a fisher cares about)."""
    if not day.get("sunrise") or not day.get("sunset"):
        return 6 <= hour_of(block["start"]) <= 18
    return block["end"] > day["sunrise"] and block["start"] < day["sunset"]


def window_reasons(bw):
    out = list(bw.get("why") or [])
    if bw.get("wind_kn") is not None:
        out.append(f"Wind {bw.get('wind_from') or ''} {round(bw['wind_kn'])} kn"
                   f"{' (' + bw['wind_rel'] + ')' if bw.get('wind_rel') else ''}".replace("  ", " "))
    if bw.get("gust_max_kn") is not None:
        out.append(f"Gusts to {round(bw['gust_max_kn'])} kn")
    if bw.get("sea_m") is not None:
        out.append(f"Sea {bw['sea_m']} m" + (f" @ {round(bw['swell_period_s'])} s" if bw.get("swell_period_s") else ""))
    if bw.get("rain_mm"):
        out.append(f"Rain {bw['rain_mm']} mm")
    return out


def window_headline(bw, rate_):
    when = bw["text"].split(",")[0]  # engine text starts "Mon 5-8am, ..."
    if bw["text"].startswith("No good window"):
        return "No good window - least-bad option"
    return {"great": f"{when} looks great", "good": f"{when} looks good",
            "marginal": f"{when} is fishable", "poor": f"{when} is the least-bad option"}[rate_]


def tide_events_from(days):
    evs = []
    for d in days:
        for t in d.get("tides") or []:
            evs.append(fe_tides.TideEvent(datetime.fromisoformat(t["time"]), float(t["height_m"]), t["kind"], ""))
    evs.sort(key=lambda e: e.time)
    return evs


def tide_series(events, start, end, step_min=30):
    """Curve between engine tide extremes using the engine's own
    cosine interpolation (fishon_engine.tides.height_at)."""
    out = []
    t = start
    while t <= end:
        h = fe_tides.height_at(events, t)
        if h is not None:
            out.append({"time": t.isoformat(), "height_m": round(h, 2)})
        t += timedelta(minutes=step_min)
    return out


# ---------------------------------------------------------------- mapping
def site_payload(fc: dict) -> tuple[dict, list[str]]:
    """Engine output -> site payload. Returns (payload, contract problems)."""
    if fc.get("api_version") == "1":          # engine >= 2.1 emits v1 itself
        from fishon_engine.contract import validate_v1
        v1 = {k: v for k, v in fc.items() if k not in DROP_TOP}
        v1["days"] = [{k: v for k, v in d.items() if k not in DROP_DAY} for d in fc["days"]]
        v1["mapper_version"] = MAPPER_VERSION
        return v1, validate_v1(fc)
    return legacy_to_v1(fc), ["engine < 2.1: mapped by legacy_to_v1"]


def legacy_to_v1(fc: dict) -> dict:
    sp = fe.get_spot(fc["spot"]["id"])
    days_in = fc["days"]
    coastal = sp.is_coastal
    events = tide_events_from(days_in) if coastal else []
    modelled = (fc["tide_source"] or "").lower().startswith("open-meteo")
    datum = "MSL (Open-Meteo modelled sea level)" if modelled else "chart datum (LINZ)"

    hourly, days, windows, tides = [], [], [], []
    for d in days_in:
        blocks = d.get("blocks_3h") or []
        for b in blocks:
            mid = datetime.fromisoformat(b["start"]) + timedelta(minutes=90)
            hourly.append({
                "time": b["start"],
                "wind_kn": r1(b.get("wind_kn")),
                "gust_kn": r1(b.get("gust_max_kn")),
                "wind_dir_deg": b.get("wind_from_deg"),
                "swell_m": b.get("sea_m") if coastal else None,
                "swell_period_s": b.get("swell_period_s") if coastal else None,
                "sst_c": b.get("sst_c") if coastal else None,
                "tide_m": (round(fe_tides.height_at(events, mid), 2)
                           if coastal and fe_tides.height_at(events, mid) is not None else None),
                "rain_mm": b.get("rain_mm"),
                "score": b.get("score"),
            })
        day_blocks = [b for b in blocks if is_daylightish(b, d)] or blocks
        bw = d.get("best_window")
        days.append({
            "date": d["date"],
            "score": d["score"],
            "rating": rating(d["score"]),
            "summary": d["verdict"],
            "wind_kn_avg": mean([b.get("wind_kn") for b in day_blocks]),
            "gust_kn_max": r1(max([b["gust_max_kn"] for b in day_blocks if b.get("gust_max_kn") is not None], default=None)),
            "swell_m_avg": mean([b.get("sea_m") for b in day_blocks]) if coastal else None,
            "rain_mm": r1(sum(b.get("rain_mm") or 0 for b in blocks)),
            "sst_c_avg": d.get("sst_c") if coastal else None,
            "sunrise": d.get("sunrise"),
            "sunset": d.get("sunset"),
            # --- proposed v1.1 additive fields (engine data with no v1 slot)
            "label": d.get("label"),
            "confidence": d.get("confidence"),
            "verdict_text": d["verdict"],
            "best_window_text": bw["text"] if bw else None,
            "moon": d.get("moon"),
            "species": d.get("species") or [],
        })
        if bw:
            rt = rating(bw["score"])
            windows.append({
                "start": bw["start"], "end": bw["end"], "score": bw["score"], "rating": rt,
                "headline": window_headline(bw, rt), "advice": bw["text"],
                "reasons": window_reasons(bw),
                "confidence": d.get("confidence"),
            })
        for t in d.get("tides") or []:
            tides.append({"time": t["time"], "type": t["kind"], "height_m": t["height_m"]})

    windows.sort(key=lambda w: -w["score"])
    best = windows[0] if windows else None
    if best:
        bday = next(x for x in days if x["date"] == best["start"][:10])
        verdict = {"rating": best["rating"], "score": best["score"],
                   "headline": ("Go " if best["rating"] in ("great", "good") else "Best chance: ") + best["advice"].split(",")[0],
                   "advice": best["advice"], "confidence": bday["confidence"] or "low"}
    else:
        verdict = {"rating": "poor", "score": 0, "headline": "No fishable window found",
                   "advice": "The engine found no usable daylight window in this period.", "confidence": "low"}

    tseries = []
    if events:
        start = datetime.fromisoformat(days_in[0]["date"] + "T00:00:00").replace(tzinfo=NZ)
        end = datetime.fromisoformat(days_in[-1]["date"] + "T23:30:00").replace(tzinfo=NZ)
        tseries = tide_series(events, start, end)

    return {
        "api_version": API_VERSION,
        "spot": {"id": sp.id, "name": sp.name, "region": sp.region, "island": sp.island,
                 "lat": sp.lat, "lon": sp.lon, "species": list(sp.species), "notes": sp.notes,
                 "tags": list(sp.tags), "coastal": coastal,
                 "facing_deg": fc["spot"].get("facing_deg"), "facing_note": fc["spot"].get("facing_note"),
                 "tide_port": fc["spot"].get("tide_port"), "tide_note": sp.tide_note},
        "generated_at": fc["generated_at"],
        "model_run": "not exposed by engine (Open-Meteo best-match; see generated_at)",
        "sources": list(fc.get("attribution") or []) + ([f"Tides: {fc['tide_source']}"] if coastal else []),
        "verdict": verdict,
        "days": days,
        "windows": windows,
        "tides": tides,
        "hourly": hourly,
        # --- proposed v1.1 additive fields
        "data_status": "engine",
        "engine_version": fe.__version__,
        "mapper_version": MAPPER_VERSION,
        "hourly_step_h": 3,
        "tide_source": fc["tide_source"] if coastal else None,
        "tide_datum": datum if coastal else None,
        "tide_series": tseries,
        "warnings": list(fc.get("warnings") or []),
    }


# ---------------------------------------------------------------- SST map
def build_sst(out: Path, public: Path):
    """One batched Open-Meteo POST (~663 location-calls, cached 6 h by the
    engine) -> compact JSON for the site's SVG map + the engine PNG."""
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
    payload = {
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
    (out / "sst").mkdir(parents=True, exist_ok=True)
    tmp = out / "sst" / ".latest.json.tmp"
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    tmp.replace(out / "sst" / "latest.json")
    public.mkdir(parents=True, exist_ok=True)
    sm.render_png(grid, str(public / "sst_latest.png"), land=land)
    return payload


# ---------------------------------------------------------------- storage
SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS forecast_runs (
  id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, engine_version TEXT,
  mapper_version TEXT, days INTEGER, spots_ok INTEGER, spots_failed INTEGER, status TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS spot_forecasts (
  run_id TEXT NOT NULL REFERENCES forecast_runs(id), spot_id TEXT NOT NULL, api_version TEXT NOT NULL,
  generated_at TEXT, valid_from TEXT, valid_to TEXT, status TEXT NOT NULL, error TEXT,
  tide_source TEXT, payload TEXT, engine_payload TEXT, PRIMARY KEY (run_id, spot_id));
CREATE TABLE IF NOT EXISTS tide_events (
  run_id TEXT NOT NULL, spot_id TEXT NOT NULL, time TEXT NOT NULL, type TEXT NOT NULL,
  height_m REAL, datum TEXT, source TEXT, PRIMARY KEY (run_id, spot_id, time));
CREATE VIEW IF NOT EXISTS latest_spot_forecasts AS
  SELECT f.* FROM spot_forecasts f JOIN (
    SELECT spot_id, MAX(generated_at) g FROM spot_forecasts WHERE status='ok' GROUP BY spot_id) l
  ON f.spot_id=l.spot_id AND f.generated_at=l.g WHERE f.status='ok';
CREATE TABLE IF NOT EXISTS sst_maps (
  run_id TEXT PRIMARY KEY, valid_time TEXT, step_deg REAL, api_calls INTEGER, payload TEXT);
"""


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--days", type=int, default=10)
    ap.add_argument("--spots", nargs="*", help="spot ids (default: all engine spots)")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--public", default=str(ROOT / "web" / "public" / "sst"))
    ap.add_argument("--no-sst", action="store_true", help="skip the SST map (saves ~663 Open-Meteo calls)")
    a = ap.parse_args(argv)

    out = Path(a.out)
    latest = out / "forecasts" / "latest"
    latest.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(out / "saltsupply.sqlite")
    db.executescript(SQLITE_SCHEMA)

    run_id = str(uuid.uuid4())
    started = datetime.now(NZ).isoformat(timespec="seconds")
    db.execute("INSERT INTO forecast_runs (id, started_at, engine_version, mapper_version, days, status) VALUES (?,?,?,?,?,?)",
               (run_id, started, fe.__version__, MAPPER_VERSION, a.days, "running"))
    ids = a.spots or sorted(fe.SPOTS)
    ok, failed, problems = [], {}, {}
    kw = {}
    try:
        from fishon_engine import openmeteo as fe_om
        kw["model_runs"] = fe_om.fetch_model_runs()  # 5 small GETs, shared by all spots
    except Exception:  # engine 2.0 has no model metadata
        pass
    for sid in ids:
        try:
            fc = fe.forecast_spot(sid, days=a.days, **kw)
            v1, probs = site_payload(fc)
            if probs:
                problems[sid] = probs[:20]
            v1["run_id"] = run_id
            tmp = latest / f".{sid}.json.tmp"
            tmp.write_text(json.dumps(v1, ensure_ascii=False, separators=(",", ":")))
            tmp.replace(latest / f"{sid}.json")  # atomic swap; site never sees half a file
            db.execute("INSERT INTO spot_forecasts VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                       (run_id, sid, API_VERSION, v1["generated_at"], v1["days"][0]["date"], v1["days"][-1]["date"],
                        "ok", None, v1["tide_source"], json.dumps(v1), json.dumps(fc, default=str)))
            db.executemany("INSERT OR REPLACE INTO tide_events VALUES (?,?,?,?,?,?,?)",
                           [(run_id, sid, t["time"], t["type"], t["height_m"], t.get("datum", v1["tide_datum"]), t.get("source", v1["tide_source"])) for t in v1["tides"]])
            ok.append(sid)
            d1 = v1["days"][1] if len(v1["days"]) > 1 else v1["days"][0]
            print(f"ok   {sid:22} {v1['tide_source'] or 'freshwater':34.34} best {v1['verdict']['score']:>4} "
                  f"| {d1['date']} wind {d1['wind_kn_avg']} kn gust {d1['gust_kn_max']} wave {d1.get('wave_m_avg')} m "
                  f"swell {d1['swell_m_avg']} m sst {d1['sst_c_avg']} C{'  CONTRACT: ' + str(len(probs)) if probs else ''}")
        except Exception as e:  # keep going; site falls back to labelled mock for this spot
            failed[sid] = f"{type(e).__name__}: {e}"
            db.execute("INSERT INTO spot_forecasts (run_id, spot_id, api_version, status, error) VALUES (?,?,?,?,?)",
                       (run_id, sid, API_VERSION, "error", failed[sid]))
            print(f"FAIL {sid}: {failed[sid]}", file=sys.stderr)
            traceback.print_exc(limit=2)
    sst = None
    if not a.no_sst:
        try:
            sst = build_sst(out, Path(a.public))
            db.execute("INSERT OR REPLACE INTO sst_maps VALUES (?,?,?,?,?)",
                       (run_id, sst["valid_time_nz"], sst["step"], sst["api_calls_counted"], json.dumps(sst)))
            print(f"sst  map valid {sst['valid_text']}: {sum(v is not None for r in sst['sst'] for v in r)} cells, "
                  f"{sst['api_calls_counted']} Open-Meteo calls counted, cache {sst['cache']}")
        except Exception as e:  # site hides the map (labelled) if this fails
            failed["sst_map"] = f"{type(e).__name__}: {e}"
            print(f"FAIL sst map: {failed['sst_map']}", file=sys.stderr)
    finished = datetime.now(NZ).isoformat(timespec="seconds")
    status = "ok" if not failed else ("partial" if ok else "failed")
    model_run = next((json.loads(open(latest / f"{s_}.json").read()).get("model_run") for s_ in ok[:1]), None)
    db.execute("UPDATE forecast_runs SET finished_at=?, spots_ok=?, spots_failed=?, status=?, notes=? WHERE id=?",
               (finished, len(ok), len(failed), status, json.dumps(failed) if failed else None, run_id))
    db.commit()
    db.close()
    manifest = {"run_id": run_id, "started_at": started, "finished_at": finished, "status": status,
                "engine_version": fe.__version__, "mapper_version": MAPPER_VERSION, "api_version": API_VERSION,
                "days": a.days, "spots_ok": ok, "spots_failed": failed, "contract_problems": problems,
                "model_run": model_run, "model_runs": kw.get("model_runs"),
                "sst_map": None if not sst else {"valid_time_nz": sst["valid_time_nz"], "api_calls_counted": sst["api_calls_counted"]},
                "open_meteo_tier": "customer (API key set)" if os.environ.get("OPEN_METEO_API_KEY") else "free (non-commercial)"}
    (out / "forecasts" / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"\nrun {run_id}: {status} - {len(ok)} ok, {len(failed)} failed -> {latest}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
