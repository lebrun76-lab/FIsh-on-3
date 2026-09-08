"""
NZ Fishing Centres
Comprehensive list of main recreational fishing centres across New Zealand.
Users select one or more areas they care about.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional

@dataclass
class FishingCentre:
    id: str
    name: str
    region: str                    # High-level region for grouping
    island: str                    # "North" or "South"
    lat: float
    lon: float
    species: List[str]
    notes: str
    tags: List[str] = field(default_factory=list)   # e.g. ["coastal", "boat", "shore", "freshwater"]

# ============================================================
# MAIN FISHING CENTRES – North Island
# ============================================================
CENTRES: Dict[str, FishingCentre] = {
    # --- Far North & Northland ---
    "bay_of_islands": FishingCentre(
        id="bay_of_islands",
        name="Bay of Islands",
        region="Northland",
        island="North",
        lat=-35.25, lon=174.12,
        species=["Snapper", "Kingfish", "Kahawai", "Trevally", "John Dory", "Hapuku"],
        notes="Iconic northern fishing. Snapper and kings the main draw.",
        tags=["coastal", "boat", "shore"]
    ),
    "far_north": FishingCentre(
        id="far_north",
        name="Far North (Houhora / Houhora Heads)",
        region="Northland",
        island="North",
        lat=-34.80, lon=173.10,
        species=["Snapper", "Kingfish", "Trevally", "Kahawai", "Tuna (seasonal)"],
        notes="Remote and productive. Great for those willing to travel.",
        tags=["coastal", "boat"]
    ),

    # --- Auckland / Hauraki ---
    "hauraki_gulf": FishingCentre(
        id="hauraki_gulf",
        name="Hauraki Gulf",
        region="Auckland",
        island="North",
        lat=-36.70, lon=175.00,
        species=["Snapper", "Kingfish", "Kahawai", "Trevally", "John Dory", "Gurnard"],
        notes="Auckland’s playground. Huge variety of spots from shore and boat.",
        tags=["coastal", "boat", "shore"]
    ),
    "coromandel": FishingCentre(
        id="coromandel",
        name="Coromandel",
        region="Waikato / Coromandel",
        island="North",
        lat=-36.75, lon=175.50,
        species=["Snapper", "Kingfish", "Kahawai", "Trevally", "Gurnard"],
        notes="Eastern seaboard classic. Excellent boat and kayak fishing.",
        tags=["coastal", "boat", "shore"]
    ),

    # --- Bay of Plenty ---
    "bay_of_plenty": FishingCentre(
        id="bay_of_plenty",
        name="Bay of Plenty (Tauranga / Whakatāne)",
        region="Bay of Plenty",
        island="North",
        lat=-37.70, lon=176.50,
        species=["Snapper", "Kingfish", "Kahawai", "Trevally", "Gurnard", "Hapuku"],
        notes="Consistent producer. Good mix of inshore and deeper water.",
        tags=["coastal", "boat", "shore"]
    ),
    "east_cape": FishingCentre(
        id="east_cape",
        name="East Cape",
        region="Gisborne / East Cape",
        island="North",
        lat=-37.70, lon=178.50,
        species=["Snapper", "Kingfish", "Kahawai", "Hapuku", "Bass"],
        notes="Wild and productive. Worth the mission for serious fish.",
        tags=["coastal", "boat"]
    ),

    # --- Hawke’s Bay & lower NI ---
    "hawkes_bay": FishingCentre(
        id="hawkes_bay",
        name="Hawke’s Bay",
        region="Hawke’s Bay",
        island="North",
        lat=-39.50, lon=176.90,
        species=["Snapper", "Kahawai", "Gurnard", "Tarakihi", "Kingfish"],
        notes="Good all-round fishing with solid snapper and kahawai.",
        tags=["coastal", "boat", "shore"]
    ),
    "taranaki": FishingCentre(
        id="taranaki",
        name="Taranaki (New Plymouth)",
        region="Taranaki",
        island="North",
        lat=-39.06, lon=174.07,
        species=["Snapper", "Kahawai", "Gurnard", "Trevally", "Kingfish"],
        notes="West coast North Island. Can be weather dependent.",
        tags=["coastal", "boat", "shore"]
    ),
    "wellington": FishingCentre(
        id="wellington",
        name="Wellington / Cook Strait",
        region="Wellington",
        island="North",
        lat=-41.29, lon=174.78,
        species=["Blue Cod", "Tarakihi", "Kahawai", "Barracouta", "Groper", "Kingfish"],
        notes="Strong currents and good fishing when the weather plays ball.",
        tags=["coastal", "boat", "shore"]
    ),

    # ============================================================
    # MAIN FISHING CENTRES – South Island
    # ============================================================

    # --- Top of the South ---
    "nelson_bays": FishingCentre(
        id="nelson_bays",
        name="Nelson Bays / Golden Bay",
        region="Nelson / Tasman",
        island="South",
        lat=-41.00, lon=173.20,
        species=["Snapper", "Blue Cod", "Tarakihi", "Kahawai", "Gurnard", "Flatfish"],
        notes="Sheltered waters, great for small boats and family fishing.",
        tags=["coastal", "boat", "shore"]
    ),
    "marlborough_sounds": FishingCentre(
        id="marlborough_sounds",
        name="Marlborough Sounds",
        region="Marlborough",
        island="South",
        lat=-41.20, lon=174.00,
        species=["Blue Cod", "Snapper", "Kahawai", "Tarakihi", "Groper", "Crayfish"],
        notes="Huge area of protected waterways. Blue cod stronghold.",
        tags=["coastal", "boat", "shore"]
    ),

    # --- West Coast ---
    "greymouth": FishingCentre(
        id="greymouth",
        name="Greymouth / Hokitika",
        region="West Coast",
        island="South",
        lat=-42.45, lon=171.21,
        species=["Blue Cod", "Tarakihi", "Kahawai", "Groper", "Tuna (seasonal)"],
        notes="Main West Coast hub with good facilities.",
        tags=["coastal", "boat", "shore"]
    ),
    "haast_jackson": FishingCentre(
        id="haast_jackson",
        name="Haast / Jackson Bay",
        region="West Coast",
        island="South",
        lat=-43.90, lon=168.90,
        species=["Blue Cod", "Tarakihi", "Bluefin Tuna", "Kingfish", "Groper", "Bluenose"],
        notes="Remote West Coast gem. Blue cod close, tuna and kings further out.",
        tags=["coastal", "boat"]
    ),

    # --- Canterbury ---
    "kaikoura": FishingCentre(
        id="kaikoura",
        name="Kaikōura",
        region="Canterbury",
        island="South",
        lat=-42.40, lon=173.68,
        species=["Blue Cod", "Tarakihi", "Groper", "Kahawai", "Crayfish", "Tuna"],
        notes="Deep water close to shore. Famous for crayfish and big fish.",
        tags=["coastal", "boat", "shore"]
    ),
    "banks_peninsula": FishingCentre(
        id="banks_peninsula",
        name="Banks Peninsula / Akaroa",
        region="Canterbury",
        island="South",
        lat=-43.80, lon=172.95,
        species=["Blue Cod", "Tarakihi", "Kahawai", "Gurnard", "Flatfish"],
        notes="Sheltered harbours and good shore options around Christchurch.",
        tags=["coastal", "boat", "shore"]
    ),

    # --- Otago ---
    "moeraki": FishingCentre(
        id="moeraki",
        name="Moeraki",
        region="Otago",
        island="South",
        lat=-45.36, lon=170.86,
        species=["Blue Cod", "Tarakihi", "Groper", "Kahawai", "Barracouta"],
        notes="Excellent blue cod and tarakihi. Popular from inland bases.",
        tags=["coastal", "boat", "shore"]
    ),
    "dunedin": FishingCentre(
        id="dunedin",
        name="Dunedin / Otago Peninsula",
        region="Otago",
        island="South",
        lat=-45.87, lon=170.50,
        species=["Blue Cod", "Tarakihi", "Kahawai", "Groper", "Barracouta"],
        notes="Good mix of harbour and open coast fishing.",
        tags=["coastal", "boat", "shore"]
    ),
    "catlins": FishingCentre(
        id="catlins",
        name="Catlins",
        region="Otago / Southland",
        island="South",
        lat=-46.55, lon=169.45,
        species=["Blue Cod", "Tarakihi", "Kahawai", "Groper"],
        notes="Quieter coastline. Rewarding when the swell drops.",
        tags=["coastal", "boat", "shore"]
    ),

    # --- Southland & Fiordland ---
    "bluff": FishingCentre(
        id="bluff",
        name="Bluff",
        region="Southland",
        island="South",
        lat=-46.60, lon=168.33,
        species=["Blue Cod", "Tarakihi", "Groper", "Hapuku", "Crayfish"],
        notes="Legendary blue cod fishery. One of the best in the country.",
        tags=["coastal", "boat", "shore"]
    ),
    "fiordland": FishingCentre(
        id="fiordland",
        name="Fiordland (Milford / Doubtful / Dusky)",
        region="Fiordland",
        island="South",
        lat=-44.67, lon=167.93,
        species=["Blue Cod", "Groper", "Tarakihi", "Crayfish", "Bluefin (offshore)"],
        notes="World-class but weather and access dependent.",
        tags=["coastal", "boat"]
    ),
    "stewart_island": FishingCentre(
        id="stewart_island",
        name="Stewart Island / Rakiura",
        region="Southland",
        island="South",
        lat=-46.90, lon=168.13,
        species=["Blue Cod", "Tarakihi", "Groper", "Crayfish", "Hapuku"],
        notes="Remote and special. Outstanding fishing when you get there.",
        tags=["coastal", "boat", "shore"]
    ),

    # --- Freshwater / Inland ---
    "central_otago_lakes": FishingCentre(
        id="central_otago_lakes",
        name="Central Otago Lakes (Wānaka / Hāwea / Wakatipu)",
        region="Central Otago",
        island="South",
        lat=-44.70, lon=169.15,
        species=["Brown Trout", "Rainbow Trout", "Salmon (seasonal)"],
        notes="Home water for inland South Islanders. Excellent trout fishing.",
        tags=["freshwater", "shore", "boat"]
    ),
    "southern_lakes": FishingCentre(
        id="southern_lakes",
        name="Southern Lakes (Te Anau / Manapouri)",
        region="Southland",
        island="South",
        lat=-45.40, lon=167.70,
        species=["Brown Trout", "Rainbow Trout", "Salmon"],
        notes="Scenic and productive trout waters.",
        tags=["freshwater", "shore", "boat"]
    ),
}


def list_all_centres() -> List[FishingCentre]:
    """Return every centre sorted by island then name."""
    return sorted(CENTRES.values(), key=lambda c: (c.island, c.name))


def list_by_island(island: str) -> List[FishingCentre]:
    return [c for c in CENTRES.values() if c.island.lower() == island.lower()]


def list_by_region(region: str) -> List[FishingCentre]:
    return [c for c in CENTRES.values() if region.lower() in c.region.lower()]


def get_centres_by_ids(ids: List[str]) -> List[FishingCentre]:
    """Return centres matching the given list of ids (user selection)."""
    return [CENTRES[i] for i in ids if i in CENTRES]


def get_default_selection_for_base(base: str) -> List[str]:
    """
    Sensible default multi-select based on a home location keyword.
    Used when the user first sets up or hasn’t chosen yet.
    """
    base = base.lower()
    if any(x in base for x in ["hawea", "wanaka", "queenstown", "cromwell", "alexandra"]):
        return ["haast_jackson", "moeraki", "bluff", "greymouth", "fiordland", "central_otago_lakes"]
    if any(x in base for x in ["nelson", "motueka", "takaka"]):
        return ["nelson_bays", "marlborough_sounds", "kaikoura"]
    if any(x in base for x in ["christchurch", "canterbury", "ashburton", "timaru"]):
        return ["kaikoura", "banks_peninsula", "moeraki"]
    if any(x in base for x in ["dunedin", "otago", "mosgiel"]):
        return ["moeraki", "dunedin", "catlins", "bluff"]
    if any(x in base for x in ["invercargill", "southland", "gore"]):
        return ["bluff", "catlins", "fiordland", "stewart_island"]
    if any(x in base for x in ["auckland", "north shore", "manukau"]):
        return ["hauraki_gulf", "coromandel", "bay_of_islands"]
    if any(x in base for x in ["tauranga", "rotorua", "whakatane"]):
        return ["bay_of_plenty", "coromandel", "east_cape"]
    if any(x in base for x in ["wellington", "porirua", "lower hutt"]):
        return ["wellington", "marlborough_sounds", "nelson_bays"]
    # Generic South Island inland fallback
    return ["haast_jackson", "moeraki", "bluff", "central_otago_lakes"]
