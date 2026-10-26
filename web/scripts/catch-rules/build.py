#!/usr/bin/env python3
"""Builds src/data/catch-rules.json (and the second-check CSV) from the hand-entered
values below. Every number here was read off a current MPI area page or the
Fisheries (Recreational Management Controls) Notice No.1 2026 on 26 Oct 2026.

Encoding:
  minSizeCm   number | "none" (MPI sets no minimum) | null (not confirmed: UI sends you to MPI)
  dailyLimit  number | "combined" (no separate limit, counts toward the area total)
              | "no-take" | null (not confirmed)
Every row ships verified:false until a person has ticked it off against MPI.

Usage: python3 scripts/catch-rules/build.py [--csv /workspace/research/catch-rules-to-verify.csv]
"""
import csv, json, sys, copy
from pathlib import Path

CHECKED = "2026-10-26"
PAGE = "https://www.mpi.govt.nz/fishing-aquaculture/recreational-fishing/fishing-rules/"
NOTICE = "https://www.mpi.govt.nz/dmsdocument/71138-Fisheries-Recreational-Management-Controls-Notice-No.-1-2026"
SRC = {
    "ak": (PAGE + "auckland-kermadec-fishing-rules", "2026-09-10"),
    "cen": (PAGE + "central-fishing-rules", "2026-10-16"),
    "cha": (PAGE + "challenger-fishing-rules", "2026-07-15"),
    "kai": (PAGE + "kaikoura-fishing-rules", "2026-07-15"),
    "se": (PAGE + "south-east-fishing-rules", "2026-09-28"),
    "sl": (PAGE + "southland-fishing-rules", "2026-07-15"),
    "fio": (PAGE + "fiordland-marine-area-fishing-rules", "2026-07-15"),
}

SPECIES = [
    ("snapper", "Snapper", "Tāmure"), ("kingfish", "Kingfish", "Haku"), ("blue_cod", "Blue cod", "Rāwaru"),
    ("tarakihi", "Tarakihi", None), ("red_gurnard", "Red gurnard", "Kumukumu"), ("kahawai", "Kahawai", None),
    ("trevally", "Trevally", "Araara"), ("blue_moki", "Blue moki", None), ("red_moki", "Red moki", None),
    ("hapuku_bass", "Hāpuku / bass (groper)", None), ("flatfish", "Flatfish", "Pātiki"), ("bluenose", "Bluenose", None),
    ("sbt", "Southern bluefin tuna", None), ("john_dory", "John dory", "Kuparu"), ("barracouta", "Barracouta", "Mangā"),
]

def r(min_, daily, part=None, **kw):
    d = {"minSizeCm": min_, "dailyLimit": daily, "noticePart": part}
    d.update(kw)
    return d

# National minimums (Notice Part 1, 4.1) and daily limits (3.3).
NATIONAL = {
    "snapper": r(25, "combined", "4.1"), "kingfish": r(75, "combined", "4.1"),
    "blue_cod": r(33, "combined", "4.1", landedState="Landed whole or gutted"),
    "tarakihi": r(25, "combined", "4.1"), "red_gurnard": r(25, "combined", "4.1"),
    "kahawai": r("none", "combined"), "trevally": r(25, "combined", "4.1"),
    "blue_moki": r(40, "combined", "4.1"), "red_moki": r(40, "combined", "4.1"),
    "hapuku_bass": r("none", "combined"), "flatfish": r(25, "combined", "4.1", notes=["Sand flounder minimum is 23 cm."]),
    "bluenose": r("none", "combined"), "sbt": r("none", 1, "3.3"),
    "john_dory": r("none", "combined"), "barracouta": r("none", "combined"),
}

def zone(base, src, overrides):
    rows = copy.deepcopy(base)
    for k, v in overrides.items():
        rows[k] = {**rows.get(k, {}), **v} if v is not None else None
    for k in rows:
        rows[k].setdefault("sourceUrl", SRC[src][0])
        rows[k].setdefault("sourceKey", src)
    return rows

AK_ACC = "Accumulation limit 3 hāpuku/bass when fishing over more than one day."
BC_ACC = "Accumulation limit: 2 daily limits."
akl_east = zone(NATIONAL, "ak", {
    "snapper": r(30, 7, "8.2, 11.1"), "kingfish": r(75, 3, "8.4"),
    "blue_cod": r(30, "combined", "11.2", landedState="Landed whole or gutted", accumulation=BC_ACC),
    "hapuku_bass": r("none", 2, "8.3, 10.1", accumulation=AK_ACC), "bluenose": r("none", 5, "8.1"),
})
akl_west = zone(akl_east, "ak", {"snapper": r(27, 10, "8.2, 11.1")})

central_fma2 = zone(NATIONAL, "cen", {
    "snapper": r(27, 10, "13.1, 16.1"), "kingfish": r(75, 3, "13.1"),
    "hapuku_bass": r("none", 2, "13.1, 15.1", accumulation="Accumulation limit 3 hāpuku/bass."),
    "bluenose": r("none", 5, "13.1"),
    "blue_cod": r(33, 20, None, landedState="Landed whole or gutted", accumulation=BC_ACC,
                  notes=["The 20 comes from the MPI Central page. The 2026 notice doesn't list it, so check."]),
})
central_fma8 = zone(central_fma2, "cen", {
    "blue_cod": r(33, 2, "13.2", landedState="Landed whole or gutted", accumulation=BC_ACC, notes=[]),
})

CHA_BASE = zone(NATIONAL, "cha", {
    "snapper": r(25, 10, "19.1"), "kingfish": r(75, 3, "19.1"),
    "hapuku_bass": r("none", 2, "19.1, 21.1", accumulation="Accumulation limit 3 hāpuku/bass."),
    "bluenose": r("none", 5, "19.1"),
    "flatfish": r(25, "combined", "4.1, 22.1", notes=["Sand flounder minimum is 25 cm in Challenger."]),
})
tasman = zone(CHA_BASE, "cha", {"blue_cod": r(33, 2, "41.8", landedState="Landed whole or gutted",
    accumulation="You can hold 4 if no more than 2 were taken from the Tasman area on any one day.")})
sounds = zone(tasman, "cha", {"snapper": r(25, 3, "19.2"),
    "blue_cod": {"closure": {"from": "09-01", "to": "01-10", "text": "Blue cod closed in the Marlborough Sounds 1 September to 10 January."}}})
westland = zone(CHA_BASE, "cha", {"blue_cod": r(33, 15, "41.9", landedState="Whole, gutted, or headed and gutted (headed minimum 24 cm)", accumulation=BC_ACC)})
southwest_cha = zone(CHA_BASE, "cha", {"blue_cod": r(33, 10, "41.6", landedState="Landed whole or gutted", accumulation=BC_ACC)})
jackson_mataitai = zone(CHA_BASE, "cha", {
    "snapper": r(25, 5), "kingfish": r(75, 1), "hapuku_bass": r("none", 1), "bluenose": r("none", 2),
    "blue_cod": r(33, None, landedState="Whole, gutted, or headed and gutted",
                  notes=["MPI's table shows 5 and a vessel limit of 15 but the layout is unclear. Check the Challenger page."]),
})

KAI_GROUP = "Albacore, bluenose, hāpuku/bass, kingfish and ling: 5 in total, no more than 3 of any one."
kaikoura_ma = zone(NATIONAL, "kai", {
    "blue_cod": r(33, 6, "26.4", landedState="Landed whole or gutted", accumulation=BC_ACC),
    "kahawai": r("none", 10, "26.4"), "tarakihi": r(25, 10, "26.4"), "snapper": r(25, 10, "26.1"),
    "blue_moki": r(40, 10, "26.4"), "red_moki": r(40, "no-take", None, notes=["MPI Kaikōura page: no take."]),
    "kingfish": r(75, 3, "26.4, 27.5", shared=KAI_GROUP), "hapuku_bass": r("none", 3, "26.4, 27.5", shared=KAI_GROUP),
    "bluenose": r("none", 3, "26.4, 27.5", shared=KAI_GROUP),
})
kaikoura_taiapure = zone(kaikoura_ma, "kai", {"blue_cod": r(33, 2, "26.4", landedState="Landed whole or gutted", accumulation=BC_ACC)})

SE_GROUP = "Hāpuku/bass and kingfish: 5 in total, no more than 3 kingfish."
SE_BASE = zone(NATIONAL, "se", {
    "snapper": r(25, 10, "26.1"), "kahawai": r("none", 15, "26.1"), "tarakihi": r(25, 15, "26.1"),
    "blue_moki": r(40, 15, "26.1"), "red_moki": r(40, 15, "26.1"), "bluenose": r("none", 5, "26.1"),
    "kingfish": r(75, 3, "26.1, 27.2", shared=SE_GROUP), "hapuku_bass": r("none", 5, "27.2", shared=SE_GROUP),
})
north_otago = zone(SE_BASE, "se", {"blue_cod": r(33, 10, "41.5", landedState="Landed whole or gutted", accumulation=BC_ACC)})
southern_se = zone(SE_BASE, "se", {"blue_cod": r(33, 10, "41.7", landedState="Whole, gutted, or headed (headed minimum 24 cm)", accumulation=BC_ACC)})
east_otago = zone(SE_BASE, "se", {"blue_cod": r(33, 2, "26.2", landedState="Landed whole or gutted", accumulation=BC_ACC)})
canterbury = zone(SE_BASE, "se", {"blue_cod": r(33, 2, "41.1", landedState="Landed whole or gutted", accumulation=BC_ACC)})
akaroa = zone(canterbury, "se", {"blue_moki": r(40, 3, None, notes=["Akaroa limit from the MPI South-East page."])})
lyttelton = zone(canterbury, "se", {
    "blue_cod": r(33, "no-take", None, notes=["Closed in the Rāpaki, Lyttelton/Whakaraupō and Extension mātaitai."]),
    "kahawai": r("none", 5), "blue_moki": r(40, "no-take", None, notes=["MPI South-East page: closed in the Lyttelton mātaitai."]),
    "flatfish": r(25, 5, None, notes=["Sand flounder minimum is 23 cm."]),
})

SL_BASE = zone(NATIONAL, "sl", {
    "kahawai": r("none", 15, "38.1"), "tarakihi": r(25, 15, "38.1"), "blue_moki": r(40, 15, "38.1"),
    "red_moki": r(40, 15, "38.1"), "bluenose": r("none", 5, "38.1"),
    "kingfish": r(75, 3, "38.1, 39.2", shared=SE_GROUP), "hapuku_bass": r("none", 5, "39.2", shared=SE_GROUP),
})
southern_sl = zone(SL_BASE, "sl", {"blue_cod": r(33, 10, "41.7", landedState="Whole, gutted, or headed (headed minimum 24 cm)", accumulation=BC_ACC)})
paterson = zone(southern_sl, "sl", {"blue_cod": r(33, 10, "38.2", landedState="Whole, gutted, or headed (headed minimum 24 cm)", accumulation=BC_ACC),
    "flatfish": r(25, 10, None, notes=["Sand flounder minimum is 23 cm."])})

FIO_ACC = "No accumulation in the Fiordland Marine Area: never more than one day's limit."
fio_outer = zone(NATIONAL, "fio", {
    "blue_cod": r(33, 10, "38.3", landedState="Landed whole or gutted", accumulation=FIO_ACC),
    "blue_moki": r(40, 5, "38.3"), "bluenose": r("none", 3, "38.3"), "flatfish": r(25, 5, "38.3", notes=["Sand flounder minimum is 23 cm."]),
    "hapuku_bass": r("none", 3, "38.3", shared=SE_GROUP), "kahawai": r("none", 5, "38.3"), "kingfish": r(75, 3, "38.1", shared=SE_GROUP),
    "red_gurnard": r(25, 5, "38.3"), "red_moki": r(40, 5, "38.3"), "snapper": r(25, 5, "38.3"), "tarakihi": r(25, 10, "38.3"),
    "trevally": r(25, 5, "38.3"), "barracouta": r("none", 20, "38.3"), "john_dory": r("none", 10, "38.3", notes=["'Any other finfish' limit."]),
})
fiords = zone(fio_outer, "fio", {
    "blue_cod": r(33, 1, "38.4", landedState="Landed whole or gutted", accumulation=FIO_ACC), "blue_moki": r(40, 1, "38.4"),
    "bluenose": r("none", 1, "38.4"), "flatfish": r(25, 2, "38.4", notes=["Sand flounder minimum is 23 cm."]),
    "hapuku_bass": r("none", 1, "38.4"), "kahawai": r("none", 1, "38.4"), "red_gurnard": r(25, 2, "38.4"),
    "tarakihi": r(25, 1, "38.4"), "trevally": r(25, 1, "38.4"), "barracouta": r("none", 3, "38.4"),
    "john_dory": r("none", 4, "38.4", notes=["'Any other finfish' limit."]),
    "kingfish": r(75, None, None, notes=["The Fiords limit for kingfish isn't clear on the MPI page."], shared=None),
    "snapper": r(25, None, None, notes=["The Fiords limit for snapper isn't clear on the MPI page."]),
    "red_moki": r(40, None, None, notes=["The Fiords limit for red moki isn't clear on the MPI page."]),
})
milford = zone(fiords, "fio", {
    "blue_cod": r(33, "no-take", None, notes=["No blue cod may be taken in Milford Sound (Piopiotahi) internal waters."]),
    "hapuku_bass": r("none", "no-take", "38.5", notes=["Hāpuku/bass closed in all Fiordland internal waters."]),
})

ZONES = [
    # id, name, fma, combined daily, zone notes, rows
    ("akl-east", "Auckland East (North Cape to Cape Runaway)", "Auckland and Kermadec", 20, [], akl_east),
    ("akl-west", "Auckland West (North Cape to Tirua Point)", "Auckland and Kermadec", 20, [], akl_west),
    ("central-fma2", "Central: Titahi Bay round to Cape Runaway", "Central", 20, [], central_fma2),
    ("central-fma8", "Central: Tirua Point to Titahi Bay (Taranaki, Kāpiti)", "Central", 20, [], central_fma8),
    ("challenger-tasman", "Challenger: Tasman (Farewell Spit to Clarence River)", "Challenger", 20, [], tasman),
    ("challenger-sounds", "Challenger: Marlborough Sounds", "Challenger", 20, [], sounds),
    ("challenger-westland", "Challenger: Westland (Heaphy River to Haast River)", "Challenger", 20, [], westland),
    ("challenger-southwest", "Challenger: south of the Haast River to Awarua Point", "Challenger", 20, [], southwest_cha),
    ("challenger-mataitai", "Okahu/Jackson Bay and nearby mātaitai reserves", "Challenger", 10, ["Vessel limit of 30 finfish in these mātaitai."], jackson_mataitai),
    ("kaikoura-ma", "Kaikōura Marine Area", "South-East (Kaikōura)", 30, ["Hikurangi Marine Reserve and Waiopuka reef are closed to all fishing."], kaikoura_ma),
    ("kaikoura-taiapure", "Te Taumanu o Te Waka a Māui or Oaro-Haumuri taiāpure", "South-East (Kaikōura)", 30, ["Hikurangi Marine Reserve and Waiopuka reef are closed to all fishing."], kaikoura_taiapure),
    ("se-canterbury", "South-East: Canterbury (Hurunui River to Rakaia River)", "South-East", 30, [], canterbury),
    ("se-akaroa", "Akaroa Harbour taiāpure", "South-East", 10, ["Butterfish, red cod, sea perch and trumpeter: 3 each."], akaroa),
    ("se-lyttelton", "Lyttelton/Whakaraupō and Rāpaki mātaitai", "South-East", 10, ["Some species are closed or reduced inside these mātaitai. Read the South-East page."], lyttelton),
    ("se-north-otago", "South-East: North Otago (Rakaia River to Taiaroa Head)", "South-East", 30, [], north_otago),
    ("se-east-otago", "East Otago taiāpure", "South-East", 30, ["Combined limit drops to 10 in the southern part of the taiāpure."], east_otago),
    ("se-southern", "South-East: Taiaroa Head to Slope Point", "South-East", 30, [], southern_se),
    ("sl-southern", "Southland: Slope Point to Sand Hill Point", "Southland", 30, [], southern_sl),
    ("sl-paterson", "Paterson Inlet (Whaka a Te Wera) mātaitai", "Southland", 30, [], paterson),
    ("fio-outer", "Fiordland Marine Area, outside the Fiords", "Southland (Fiordland)", 20, [FIO_ACC], fio_outer),
    ("fio-fiords", "Inside the Fiords", "Southland (Fiordland)", 10, [FIO_ACC], fiords),
    ("fio-milford", "Milford Sound (Piopiotahi) internal waters", "Southland (Fiordland)", 10, [FIO_ACC], milford),
]

# Spot to zone choices. More than one choice = a boundary spot; the panel asks where you are.
SPOTS = {
    "far_north": ("The line at North Cape splits east and west snapper rules.", [("akl-east", "East coast (Houhora side)"), ("akl-west", "West coast (Ninety Mile Beach)")]),
    "bay_of_islands": (None, [("akl-east", None)]),
    "hauraki_gulf": (None, [("akl-east", None)]),
    "coromandel": (None, [("akl-east", None)]),
    "bay_of_plenty": (None, [("akl-east", None)]),
    "east_cape": ("Cape Runaway is the line between Auckland East and Central.", [("central-fma2", "East of Cape Runaway"), ("akl-east", "West of Cape Runaway")]),
    "hawkes_bay": (None, [("central-fma2", None)]),
    "taranaki": (None, [("central-fma8", None)]),
    "wellington": ("Titahi Bay splits the blue cod areas.", [("central-fma2", "Harbour, south coast and east of Titahi Bay"), ("central-fma8", "Kāpiti side, north of Titahi Bay")]),
    "marlborough_sounds": (None, [("challenger-sounds", None)]),
    "nelson_bays": (None, [("challenger-tasman", None)]),
    "greymouth": (None, [("challenger-westland", None)]),
    "haast_jackson": ("The Haast River splits the blue cod areas, and the mātaitai have their own limits.", [("challenger-westland", "North of the Haast River"), ("challenger-southwest", "South of the Haast River (Jackson Bay coast)"), ("challenger-mataitai", "Inside the Okahu/Jackson Bay mātaitai")]),
    "kaikoura": ("The two taiāpure have a lower blue cod limit.", [("kaikoura-ma", "Open coast"), ("kaikoura-taiapure", "Inside a taiāpure (Kaikōura Peninsula or Oaro-Haumuri)")]),
    "banks_peninsula": ("The harbours have their own rules.", [("se-canterbury", "Open coast"), ("se-akaroa", "Akaroa Harbour taiāpure"), ("se-lyttelton", "Lyttelton Harbour/Whakaraupō or Rāpaki mātaitai")]),
    "moeraki": (None, [("se-north-otago", None)]),
    "dunedin": ("Taiaroa Head splits the blue cod areas, and the East Otago taiāpure is lower again.", [("se-north-otago", "North of Taiaroa Head"), ("se-southern", "South of Taiaroa Head"), ("se-east-otago", "Inside the East Otago taiāpure")]),
    "catlins": ("Slope Point is the line between South-East and Southland.", [("se-southern", "East of Slope Point"), ("sl-southern", "West of Slope Point")]),
    "fiordland": ("Limits drop inside the Fiords and again in Milford's internal waters.", [("fio-outer", "Outer coast"), ("fio-fiords", "Inside the Fiords"), ("fio-milford", "Milford Sound internal waters")]),
    "bluff": (None, [("sl-southern", None)]),
    "stewart_island": ("Paterson Inlet is a mātaitai with its own rules.", [("sl-southern", "Around the island"), ("sl-paterson", "Paterson Inlet")]),
    "central_otago_lakes": ("freshwater", []),
    "southern_lakes": ("freshwater", []),
}


def main():
    names = {s[0]: {"id": s[0], "name": s[1], "maori": s[2]} for s in SPECIES}
    zones, rows = [], []
    for zid, name, fma, combined, notes, zrows in ZONES:
        src = next(iter(zrows.values()))["sourceKey"]
        zones.append({"id": zid, "name": name, "fma": fma, "combinedDaily": combined, "notes": notes,
                      "sourceUrl": SRC[src][0], "lastReviewedOnSource": SRC[src][1]})
        for sid, _, _ in SPECIES:
            v = zrows[sid]
            part = v.get("noticePart")
            rows.append({
                "id": f"{zid}:{sid}", "zone": zid, "species": sid,
                "minSizeCm": v["minSizeCm"], "dailyLimit": v["dailyLimit"],
                "shared": v.get("shared"), "accumulation": v.get("accumulation"),
                "closure": v.get("closure"), "landedState": v.get("landedState") if sid == "blue_cod" else None,
                "notes": v.get("notes", []),
                "sourceUrl": v["sourceUrl"], "noticeUrl": NOTICE if part else None, "noticePart": part,
                "lastReviewedOnSource": SRC[v["sourceKey"]][1], "dateChecked": CHECKED, "verified": False,
            })
    spots = [{"spotId": k, "note": None if n == "freshwater" else n, "freshwater": n == "freshwater",
              "options": [{"zone": z, "label": l} for z, l in opts]} for k, (n, opts) in SPOTS.items()]
    out = {"_about": "Recreational finfish size and daily limits, hand-entered from MPI area pages and the Fisheries (Recreational Management Controls) Notice No.1 2026. Guide only. verified:false until checked by a person. Built by scripts/catch-rules/build.py.",
           "attribution": "This work is based on/includes MPI data which is licensed by Ministry for Primary Industries (MPI) for re-use under the Creative Commons Attribution 4.0 International licence.",
           "noticeUrl": NOTICE, "dateChecked": CHECKED, "species": list(names.values()), "zones": zones, "rows": rows, "spots": spots}
    dest = Path(__file__).resolve().parents[2] / "src/data/catch-rules.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    filled = sum(1 for x in rows if x["minSizeCm"] is not None and x["dailyLimit"] is not None)
    print(f"{len(rows)} rows, {filled} fully filled, {len(rows) - filled} with a null; wrote {dest}")
    if "--csv" in sys.argv:
        p = sys.argv[sys.argv.index("--csv") + 1]
        with open(p, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["row_id", "zone", "zone_name", "species", "min_size_cm", "daily_limit", "shared_limit", "accumulation", "closure", "landed_state", "notes", "source_url", "notice_part", "notice_url", "source_last_reviewed", "date_checked", "verified", "checker_initials", "checker_result"])
            zn = {z["id"]: z["name"] for z in zones}
            for x in rows:
                w.writerow([x["id"], x["zone"], zn[x["zone"]], names[x["species"]]["name"], "" if x["minSizeCm"] is None else x["minSizeCm"],
                            "" if x["dailyLimit"] is None else x["dailyLimit"], x["shared"] or "", x["accumulation"] or "",
                            (x["closure"] or {}).get("text", ""), x["landedState"] or "", " ".join(x["notes"]), x["sourceUrl"],
                            x["noticePart"] or "", x["noticeUrl"] or "", x["lastReviewedOnSource"], x["dateChecked"], "no", "", ""])
        print("wrote", p)

if __name__ == "__main__":
    main()
