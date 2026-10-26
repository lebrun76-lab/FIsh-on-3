"""Per-species window scores (engine 2.5.0; data: data/species_conditions.json).

A species score starts from the window's score, which already carries the
safety gate (wind, gusts, swell and sea relative to the shore), and loses
points for each sourced species condition the window misses. It is clamped
to [0, window score], so a species can never score above what the window is
safe to fish. Missing data (no tide, no SST) costs nothing.

Only species that are open and in season at the spot on the day are scored:
status 'peak', 'in season' or 'no seasonal data' (species.species_for).
'off-peak' (outside the sourced months) and 'closed' are left out, as are
species with no entry in species_conditions.json.
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from functools import lru_cache
from typing import Dict, List, Optional

from .tz import fmt_range

_PATH = os.path.join(os.path.dirname(__file__), "data", "species_conditions.json")
OPEN_STATUSES = ("peak", "in season", "no seasonal data")
SLACK_H = 0.75          # within 45 min of high or low (the engine's tide rule)
VERDICT_MIN = 4.5       # a species needs a 'marginal' score or better to be named
VERDICT_MAX = 3         # windows named per verdict line


@lru_cache(maxsize=1)
def conditions() -> Dict[str, Dict]:
    with open(_PATH, encoding="utf-8") as f:
        return json.load(f)["species"]


def display(name: str) -> str:
    """'Blue Cod' -> 'Blue cod'."""
    return name[:1].upper() + name[1:].lower()


def scorable(species_list: List[Dict]) -> List[Dict]:
    """The open, in-season species from ``species.species_for`` that have
    sourced conditions, in species_for's order (best season first)."""
    cond = conditions()
    return [s for s in species_list if s["status"] in OPEN_STATUSES and s["name"] in cond]


def _slack(st: Dict) -> bool:
    return st["hours_since_prev"] <= SLACK_H or st["hours_to_next"] <= SLACK_H


def _factor(f: Dict, hours: List[Dict], name: str):
    """(penalty, short why) for one factor over the window's hours."""
    kind, pen, lo = f["factor"], f["penalty"], name.lower()
    n = len(hours)
    if kind == "sst_min":
        ts = [h["sst_c"] for h in hours if h.get("sst_c") is not None]
        if not ts:
            return 0.0, "no sea temp data"
        t = sum(ts) / len(ts)
        if t < f["min_c"]:
            return pen, f"sea {t:.1f} C, cool for {lo}"
        return 0.0, f"sea {t:.1f} C"
    if kind == "tide_running":
        sts = [h["tide"] for h in hours if h.get("tide")]
        if not sts:
            return 0.0, "no tide data"
        k = sum(1 for st in sts if _slack(st))
        if k == 0:
            return 0.0, "tide running"
        if k == len(sts):
            return pen, "slack tide"
        return round(pen * k / len(sts), 2), f"slack for {k} of {len(sts)} h"
    if kind == "light_change":
        when = f.get("when", "either")
        lit = [h for h in hours if h.get("light") == "change of light"]
        if when == "dawn":
            lit = [h for h in lit if h["time"].hour < 12]
        elif when == "dusk":
            lit = [h for h in lit if h["time"].hour >= 12]
        if lit:
            return 0.0, "dawn" if lit[0]["time"].hour < 12 else "dusk"
        if not any(h.get("light") for h in hours):
            return 0.0, "no sun data"
        return pen, {"dawn": "no dawn", "dusk": "no dusk"}.get(when, "no dawn or dusk")
    if kind == "daylight":
        k = sum(1 for h in hours if h.get("light") == "dark")
        if k == 0:
            return 0.0, "daylight"
        return round(pen * k / n, 2), f"dark for {k} of {n} h"
    if kind == "sea_max":
        ss = [h["sea_m"] for h in hours if h.get("sea_m") is not None]
        if not ss:
            return 0.0, "no sea data"
        s = sum(ss) / len(ss)
        if s > f["max_m"]:
            return pen, f"{s:.1f} m sea, too much wash"
        return 0.0, f"low sea {s:.1f} m"
    raise ValueError(f"unknown species factor {kind!r}")


def score_species(name: str, hours: List[Dict], window_score: float) -> Dict:
    """{name, score, why} for one species over one window's hours."""
    pen, bits = 0.0, []
    for f in conditions()[name]["factors"]:
        p, why = _factor(f, hours, name)
        pen += p
        bits.append(why)
    score = max(0.0, min(window_score, round(window_score - pen, 1)))
    return {"name": name, "score": score, "why": ", ".join(bits)}


def score_window(hours: List[Dict], window_score: float, species_list: List[Dict]) -> List[Dict]:
    """windows[].species: scored open species, best first (ties keep the
    seasonal order from species_for)."""
    sc = scorable(species_list)
    out = [score_species(s["name"], hours, window_score) for s in sc]
    order = {s["name"]: i for i, s in enumerate(sc)}
    out.sort(key=lambda x: (-x["score"], order[x["name"]]))
    return out


def best_by_species(windows: List[Dict], margin: Optional[Dict] = None) -> Dict[str, str]:
    """{species: window id} with that species' best score. A later, less
    certain window must beat a nearer one by the confidence margin (as the
    headline pick does). Only scores >= VERDICT_MIN count."""
    margin = margin or {}
    best: Dict[str, tuple] = {}
    for w in windows:
        ts = datetime.fromisoformat(w["start"]).timestamp()
        for sp in w.get("species") or []:
            if sp["score"] < VERDICT_MIN:
                continue
            key = (sp["score"] - margin.get(w.get("confidence"), 0.0), -ts)
            if sp["name"] not in best or key > best[sp["name"]][0]:
                best[sp["name"]] = (key, w, sp["score"])
    ranked = sorted(best.items(), key=lambda kv: (-kv[1][2], -kv[1][0][1]))
    return {k: v[1]["id"] for k, v in ranked}


def _names(names: List[str]) -> str:
    """['Snapper', 'Kingfish', 'Kahawai'] -> 'Snapper, kingfish and kahawai'."""
    ns = [display(names[0])] + [n.lower() for n in names[1:]]
    return ns[0] if len(ns) == 1 else ", ".join(ns[:-1]) + " and " + ns[-1]


def verdict_line(best: Dict[str, str], windows: List[Dict]) -> Optional[str]:
    """'Snapper and kahawai: Mon 5–8am. Gurnard: Mon 9am–1pm.' Species that
    share a best window are named together; best first, up to VERDICT_MAX
    windows. None when no species reaches VERDICT_MIN."""
    by_id = {w["id"]: w for w in windows}
    groups: Dict[str, List[str]] = {}
    for name, wid in best.items():
        groups.setdefault(wid, []).append(name)
    parts = []
    for wid, names in list(groups.items())[:VERDICT_MAX]:
        w = by_id[wid]
        when = fmt_range(datetime.fromisoformat(w["start"]), datetime.fromisoformat(w["end"]))
        parts.append(f"{_names(names)}: {when}.")
    return " ".join(parts) or None


def factor_sources() -> Dict[str, Dict[str, List[str]]]:
    """{species: {factor: [sources]}} (for tests and docs)."""
    return {n: {f["factor"]: list(f.get("sources") or []) for f in e["factors"]}
            for n, e in conditions().items()}
