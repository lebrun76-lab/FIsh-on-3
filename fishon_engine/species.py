"""Seasonal species ranking per spot and date (data: data/species_seasons.json)."""
from __future__ import annotations

import json
import os
from datetime import date
from functools import lru_cache
from typing import Dict, List, Optional

from .spots import Spot

_PATH = os.path.join(os.path.dirname(__file__), "data", "species_seasons.json")


@lru_cache(maxsize=1)
def _entries() -> List[dict]:
    with open(_PATH, encoding="utf-8") as f:
        return json.load(f)["entries"]


def _entry_for(name: str, spot_id: str) -> Optional[dict]:
    # spot-specific entries win over "*" entries
    best = None
    for e in _entries():
        if name not in e["names"]:
            continue
        if e["spot_ids"] == "*":
            best = best or e
        elif spot_id in e["spot_ids"]:
            return e
    return best


def _in_mmdd_range(d: date, start: str, end: str) -> bool:
    md = (d.month, d.day)
    s = tuple(int(x) for x in start.split("-"))
    e = tuple(int(x) for x in end.split("-"))
    return s <= md <= e if s <= e else (md >= s or md <= e)


def species_for(spot: Spot, d: date, sst_c: Optional[float] = None) -> List[Dict]:
    """Return the spot's species with a status for date ``d``:
    'closed' (rule), 'peak', 'in season', 'off-peak', or 'no seasonal data'.
    Sorted best-first; closed species last."""
    out = []
    for name in spot.species:
        e = _entry_for(name, spot.id) or {}
        status, rank, notes = "no seasonal data", 2, []
        for c in e.get("closed", []):
            if _in_mmdd_range(d, c["from"], c["to"]):
                status, rank = "closed", 9
                notes.append(c["rule"])
        if status != "closed":
            if d.month in e.get("peak_months", []):
                status, rank = "peak", 0
            elif d.month in e.get("good_months", []):
                status, rank = "in season", 1
            elif e.get("good_months"):
                status, rank = "off-peak", 3
        if e.get("min_sst_c") is not None and sst_c is not None and status != "closed" and sst_c < e["min_sst_c"]:
            notes.append(f"sea {sst_c:.1f} C is below the ~{e['min_sst_c']} C where {name.lower()} start spawning inshore")
            rank += 1
        if e.get("note"):
            notes.append(e["note"])
        out.append({"name": name, "status": status, "how": e.get("how"), "notes": notes,
                    "sources": e.get("sources", []), "_rank": rank})
    out.sort(key=lambda x: x["_rank"])
    for x in out:
        x.pop("_rank")
    return out


def pick_target(species: List[Dict]) -> Optional[Dict]:
    for s in species:
        if s["status"] != "closed":
            return s
    return None
