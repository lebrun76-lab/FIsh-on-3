"""Spot metadata for the engine.

Builds on the 23 centres in ``regions.py`` and adds what the v2 engine needs:

* ``facing`` – compass bearing (deg true) the shoreline *faces*, i.e. the
  direction you look from the beach out to sea. Wind blowing FROM that bearing
  is onshore; wind from the opposite bearing is offshore.
* ``tide_port`` – the nearest *suitable* LINZ port to the spot's lat/lon, chosen
  by ``tideports.nearest_port`` from 87 daily-prediction sites plus LINZ
  secondary ports (time/height offsets from a standard port). See
  docs/TIDE_PORTS.md for the per-spot table. ``legacy_tide_port`` keeps the
  hand-picked port from engine v2 (the second field of ``_EXTRA``) for comparison.
  ``None`` means no port (lakes); the engine falls back to Open-Meteo's
  modelled sea level when LINZ fails.

IMPORTANT: every centre is a broad *region* (one lat/lon), not a single mark,
so ``facing`` is a first-pass estimate for the main fishing shore of that
region. Alex should review these and, ideally, split regions into real spots
(e.g. "Moeraki – Kaika rocks" vs "Moeraki – boat harbour").
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

# regions.py lives at the repo root (the Streamlit app imports it directly).
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
import regions  # noqa: E402

from . import tideports  # noqa: E402


@dataclass(frozen=True)
class Spot:
    id: str
    name: str
    region: str
    island: str
    lat: float
    lon: float
    species: Tuple[str, ...]
    notes: str
    tags: Tuple[str, ...]
    marine_lat: float
    marine_lon: float
    facing: Optional[float]          # deg true, None for lakes
    tide_port: Optional[str]         # LINZ port display name, None -> fallback
    tide_note: str = ""
    facing_note: str = ""
    tide_port_id: Optional[str] = None     # tideports.TidePort.id
    tide_port_km: Optional[float] = None   # spot lat/lon -> port, km
    legacy_tide_port: Optional[str] = None  # engine v2 hand-picked port

    @property
    def is_coastal(self) -> bool:
        return "freshwater" not in self.tags


# id: (facing deg, LINZ port, facing note, tide note)
_EXTRA: Dict[str, Tuple[Optional[float], Optional[str], str, str]] = {
    "bay_of_islands": (45, "Opua", "Bay opens to the NE", ""),
    "bay_of_plenty": (10, "Tauranga", "Tauranga/Mt Maunganui coast faces N", ""),
    "coromandel": (270, "Thames", "Centre point sits on the Firth of Thames (west) side", "Thames port; east-coast spots (Whitianga) differ"),
    "east_cape": (20, "Lottin Point - Wakatiri", "Hicks Bay/Te Araroa coast faces N-NE", ""),
    "far_north": (80, "North Cape - Otou", "Houhora/Great Exhibition Bay faces E", "Nearest standard port is ~45 km north; times are indicative"),
    "hauraki_gulf": (60, "Auckland", "East Auckland/inner Gulf shores face NE-E", ""),
    "hawkes_bay": (100, "Napier", "Napier/Hawke Bay coast faces E", ""),
    "taranaki": (330, "Port Taranaki", "New Plymouth coast faces NW", ""),
    "wellington": (180, "Wellington", "South coast faces Cook Strait (S)", ""),
    "banks_peninsula": (150, "Akaroa", "Outer Akaroa/peninsula faces SE", ""),
    "bluff": (180, "Bluff", "Foveaux Strait shore faces S", ""),
    "catlins": (135, None, "Catlins coast faces SE", "No LINZ standard port nearby; using Open-Meteo modelled sea level"),
    "dunedin": (120, "Green Island", "St Clair/Otago Peninsula open coast faces SE", "Green Island (open coast) rather than inner-harbour ports"),
    "fiordland": (260, "Deep Cove", "Fiord mouths face the Tasman (W)", "Deep Cove is inside Doubtful Sound"),
    "greymouth": (300, "Westport", "West Coast beaches face NW", "Greymouth is a LINZ secondary port of Westport; times are Westport's"),
    "haast_jackson": (310, "Jackson Bay", "Haast coast faces NW", ""),
    "kaikoura": (120, "Kaikōura", "Peninsula/coast faces E-SE", ""),
    "marlborough_sounds": (30, "Picton", "Sounds are sheltered; bearing is the outer Cook Strait entrance", "Picton (Queen Charlotte); other arms differ"),
    "moeraki": (90, "Oamaru", "Moeraki coast faces E", "Oamaru is ~30 km north; LINZ lists Moeraki as a secondary port of Timaru"),
    "nelson_bays": (0, "Nelson", "Tasman Bay shore faces N", ""),
    "stewart_island": (80, "Halfmoon Bay - Oban", "Halfmoon Bay faces E", ""),
    "central_otago_lakes": (None, None, "Lake – wind direction vs shore not scored", ""),
    "southern_lakes": (None, None, "Lake – wind direction vs shore not scored", ""),
}


def _tide_note(m: "tideports.Match") -> str:
    p = m.port
    if p.kind == "daily":
        if not m.far:
            return ""
        s = f"Tides: LINZ daily predictions for {p.name}, {m.km:g} km from the spot centre."
    else:
        s = (f"Tides: LINZ secondary port {p.name}, {m.km:g} km from the spot centre; times/heights "
             f"derived from {p.standard} with LINZ mean differences (HW {p.hw_diff_min:+d} min, "
             f"LW {p.lw_diff_min:+d} min).")
    if p.approximate:
        s += " LINZ marks this port's data approximate."
    if m.far:
        s += f" More than {tideports.FAR_KM:g} km away; treat times as indicative."
    return s


def _build() -> Dict[str, Spot]:
    out: Dict[str, Spot] = {}
    for c in regions.list_all_centres():
        facing, port, fnote, _old_tnote = _EXTRA.get(c.id, (None, None, "", ""))
        coastal = "freshwater" not in c.tags
        match = tideports.nearest_port(c.lat, c.lon) if coastal else None
        out[c.id] = Spot(
            id=c.id, name=c.name, region=c.region, island=c.island,
            lat=c.lat, lon=c.lon, species=tuple(c.species), notes=c.notes,
            tags=tuple(c.tags),
            marine_lat=c.marine_lat if c.marine_lat is not None else c.lat,
            marine_lon=c.marine_lon if c.marine_lon is not None else c.lon,
            facing=facing, facing_note=fnote,
            tide_port=match.port.name if match else None,
            tide_port_id=match.port.id if match else None,
            tide_port_km=match.km if match else None,
            tide_note=_tide_note(match) if match else "",
            legacy_tide_port=port,
        )
    return out


SPOTS: Dict[str, Spot] = _build()


def get_spot(spot_id: str) -> Spot:
    try:
        return SPOTS[spot_id]
    except KeyError:
        raise KeyError(f"Unknown spot '{spot_id}'. Known: {', '.join(sorted(SPOTS))}")


def list_spots() -> List[Spot]:
    return list(SPOTS.values())
