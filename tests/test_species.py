from datetime import date

from fishon_engine import species
from fishon_engine.spots import get_spot


def _status(spot, d, name, sst=None):
    return next(x for x in species.species_for(get_spot(spot), d, sst) if x["name"] == name)


def test_marlborough_blue_cod_closure():
    assert _status("marlborough_sounds", date(2026, 10, 25), "Blue Cod")["status"] == "closed"
    assert _status("marlborough_sounds", date(2027, 1, 10), "Blue Cod")["status"] == "closed"
    assert _status("marlborough_sounds", date(2027, 1, 11), "Blue Cod")["status"] != "closed"
    assert _status("moeraki", date(2026, 10, 25), "Blue Cod")["status"] != "closed"


def test_closed_species_never_targeted():
    sp = species.species_for(get_spot("marlborough_sounds"), date(2026, 10, 25))
    assert species.pick_target(sp)["name"] != "Blue Cod" and sp[-1]["name"] == "Blue Cod"


def test_snapper_peak_and_sst_note():
    assert _status("hauraki_gulf", date(2026, 11, 20), "Snapper")["status"] == "peak"
    assert _status("hauraki_gulf", date(2026, 7, 1), "Snapper")["status"] == "off-peak"
    cold = _status("hauraki_gulf", date(2026, 10, 25), "Snapper", sst=13.0)
    assert any("below" in n for n in cold["notes"])


def test_west_coast_tuna_season():
    assert _status("haast_jackson", date(2026, 8, 1), "Bluefin Tuna")["status"] == "peak"
    assert _status("haast_jackson", date(2026, 10, 1), "Bluefin Tuna")["status"] == "off-peak"
    # Far North "Tuna (seasonal)" is not the SBT fishery -> no invented season
    assert _status("far_north", date(2026, 8, 1), "Tuna (seasonal)")["status"] == "no seasonal data"


def test_every_sourced_claim_has_source():
    for e in species._entries():
        if e.get("good_months") or e.get("closed") or e.get("min_sst_c"):
            assert e["sources"], e["names"]


def test_round_d_sourced_seasons():
    # Kingfish: "mainly in summer" in Cook Strait, East Cape to Hawke Bay (FAR 2013/3)
    for sid in ("wellington", "east_cape", "hawkes_bay"):
        assert _status(sid, date(2027, 1, 15), "Kingfish")["status"] == "in season"
        k = _status(sid, date(2026, 10, 26), "Kingfish")
        assert k["status"] == "off-peak" and k["sources"]
    # elsewhere kingfish stays unsourced
    assert _status("hauraki_gulf", date(2027, 1, 15), "Kingfish")["status"] == "no seasonal data"
    # Te Anau / Manapouri open all year (Southland regs 2026-27)
    for n in ("Brown Trout", "Rainbow Trout", "Salmon"):
        s = _status("southern_lakes", date(2026, 7, 1), n)
        assert s["status"] == "in season" and "2026-27" in s["sources"][0]
    # the generic "Tuna" labels are not assumed to be any one species
    assert _status("kaikoura", date(2027, 2, 1), "Tuna")["status"] == "no seasonal data"
