# Tide ports: LINZ daily sites + secondary ports

Engine v2.1 picks each spot's tide port **by distance** instead of by hand.
`fishon_engine/tideports.py` takes the nearest *suitable* port to the spot's
`lat`/`lon` (the region centre in `regions.py`, **not** the marine model point).
Candidates come from two LINZ sources:

| Kind | Count | Source | How we use it |
|---|---|---|---|
| Daily predictions | 87 sites | `https://static.charts.linz.govt.nz/tide-tables/maj-ports/csv/<site> <year>.csv` (list: [tide predictions list view](https://www.linz.govt.nz/products-services/tides-and-tidal-streams/tide-predictions/tide-predictions-list-view)) | Highs/lows used as published. Positions come from each CSV's header line (`tools/build_linz_catalog.py` → `fishon_engine/data/linz_daily_ports.json`). |
| Secondary ports | 305 rows under 15 standard ports | [NZNA_Secondary-ports-2026-27.csv](https://www.linz.govt.nz/sites/default/files/2026-06/NZNA_Secondary-ports-2026-27.csv) (34.7 KB, linked from [Tide predictions](https://www.linz.govt.nz/products-services/tides-and-tidal-streams/tide-predictions)); vendored unchanged as `fishon_engine/data/linz_secondary_ports_2026-27.csv` | Standard-port highs/lows with the LINZ offsets applied. |

## Secondary-port method (LINZ)
From the NZ Nautical Almanac guide [*Find times and heights of high and low waters*](https://www.linz.govt.nz/sites/default/files/2026-06/hydro_202627-almanac_find-times-heights-OF-high-low-waters_pdf.pdf)
([how to calculate tide times and heights](https://www.linz.govt.nz/guidance/marine-information/tide-prediction-guidance/how-calculate-tide-times-and-heights)):

- secondary time = standard time + mean HW (or LW) time difference
- secondary height = secondary MSL + (standard height − standard MSL) × range ratio

A unit test reproduces the PDF's worked example: 0941 3.3 m with diff −0022, MSL 1.3, ratio 0.74 and standard MSL 1.9 gives 0919 2.3 m.
Heights are metres above the **secondary port's chart datum**. We use the *mean* differences and ignore the published range of differences, so individual tides can be out by more than the mean (see the validation table).

## Which ports can be picked
- **Kept:** daily sites, plus secondary rows that have both HW and LW differences, an MSL and a range ratio.
- **Skipped:**
  - Rows with no LW difference or no ratio (e.g. Astrolabe Roadstead, Collingwood, Tokomaru Bay, Piha).
  - Outlying islands outside 34–48°S, 166–179°E: Chathams, Kermadecs, subantarctic, Scott Base.
  - A short list of up-river, head-of-inlet or inner-harbour sites, in `EXCLUDED_FOR_MATCHING`. Examples are Dunedin (head of Otago Harbour), Port Chalmers, Helensville, Dargaville, Whangārei, Onehunga, Havelock, Ōmokoroa and Waihopai River Entrance. These are our own judgement from the positions, not LINZ's. These sites still serve as standard ports for offsets.
- **Approximate data:** rows LINZ flags `*` ("Data Approximate") are a last resort. One is used only when no other suitable port is within 30 km.
- **Daily over secondary:** a daily site is preferred over a secondary port when it is at most 5 km further away.
- **Far flag:** a spot is flagged when its chosen port is more than 30 km away.

## Spot → port, before and after
"Before" is the hand-picked port in engine v2 (PR #2). Distances are great-circle km from the spot's `lat`/`lon`.

| Spot | Before (v2) | km | After | Type | km | Flags |
|---|---|---|---|---|---|---|
| bay_of_islands | Opua | 7.4 | Russell | secondary of Marsden Point (HW +0, LW +4 min) | 1.9 | – |
| bay_of_plenty | Tauranga | 28.4 | Kaituna River Entrance | daily | 9.2 | – |
| coromandel | Thames | 42.6 | Coromandel Harbour - Whanganui Island | secondary of Auckland (HW -21, LW -15 min) | 5.8 | – |
| east_cape | Lottin Point - Wakatiri | 33.8 | Wharekahika / Hicks Bay | secondary of Gisborne (HW +39, LW +39 min) | 20.7 | skipped closer East Cape (4.8 km: LINZ marks its data approximate) |
| far_north | North Cape - Otou | 43.1 | Pukenui Wharf | secondary of Marsden Point (HW +30, LW +30 min) | 2.4 | – |
| hauraki_gulf | Auckland | 26.6 | Mātiatia Bay | daily | 9.4 | – |
| hawkes_bay | Napier | 2.3 | Napier | daily | 2.3 | – |
| taranaki | Port Taranaki | 3.4 | Port Taranaki | daily | 3.4 | – |
| wellington | Wellington | 0.8 | Wellington | daily | 0.8 | – |
| banks_peninsula | Akaroa | 1.3 | Akaroa | daily | 1.3 | – |
| bluff | Bluff | 1.5 | Bluff | daily | 1.5 | – |
| catlins | none (Open-Meteo model) | – | Waikawa Harbour | secondary of Bluff (HW +70, LW +68 min) | 24.3 | – |
| dunedin | Green Island | 12.7 | Green Island | daily | 12.7 | skipped closer Dunedin (1.5 km: head of Otago Harbour) |
| fiordland | Deep Cove | 107.7 | Fresh Water Basin | daily | 0.5 | – |
| greymouth | Westport | 84.2 | Greymouth | secondary of Westport (HW +6, LW +8 min) | 1.9 | – |
| haast_jackson | Jackson Bay | 23.3 | Jackson Bay | daily | 23.3 | skipped closer Haast River Entrance (13.2 km: LINZ marks its data approximate) |
| kaikoura | Kaikōura | 2.5 | Kaikōura | daily | 2.5 | – |
| marlborough_sounds | Picton | 9.3 | Elie Bay | daily | 7.6 | – |
| moeraki | Oamaru | 30.5 | Moeraki | secondary of Timaru (HW -8, LW -7 min) | 1.4 | – |
| nelson_bays | Nelson | 30.2 | Kaiteriteri | daily | 16.4 | skipped closer Astrolabe Roadstead (13.1 km: LINZ gives no HW or LW time difference) |
| stewart_island | Halfmoon Bay - Oban | 0.3 | Halfmoon Bay / Oban | daily | 0.3 | – |

Lakes (no tides): central_otago_lakes, southern_lakes

Result:
- No spot is more than 30 km from its port. The furthest are Catlins (24.3 km), Jackson Bay for Haast (23.3 km) and Hicks Bay for East Cape (20.7 km).
- No spot is left on the Open-Meteo model. Catlins was on the model and now uses Waikawa Harbour, from Bluff offsets.
- The model fallback still applies if a LINZ fetch fails.
- Shore bearings (`facing`) are unchanged. A test pins them.

## Validation against LINZ's own daily predictions
LINZ publishes 54 suitable sites **both** as a daily-prediction CSV and as a secondary-port row. That lets us check our offset method against LINZ's full harmonic predictions for the same site.
- Window: 26 Oct – 8 Nov 2026 (NZ time).
- Each daily high/low is matched to the nearest derived event of the same type within 4 h.
- Reproduce with `tools/validate_secondary.py 2026-10-26 2026-11-08`.

Error = derived − daily.

| Site | Standard port | HW/LW diff (min) | Events matched | Time error mean / max abs (min) | Height error mean / max abs (m) |
|---|---|---|---|---|---|
| Thames | Auckland | -17 / -10 | 58 | +1 / 9 | -0.07 / 0.20 |
| Leigh | Auckland | -12 / -1 | 58 | -2 / 8 | -0.09 / 0.24 |
| Mātiatia Bay | Auckland | -11 / -2 | 58 | +7 / 27 | -0.12 / 0.29 |
| Dog Island | Bluff | -17 / -35 | 58 | +0 / 5 | -0.09 / 0.18 |
| Riverton / Aparima | Bluff | -52 / -48 | 58 | -1 / 7 | -0.02 / 0.13 |
| Flour Cask Bay | Bluff | -84 / -96 | 58 | -4 / 9 | -0.02 / 0.13 |
| Halfmoon Bay / Oban | Bluff | -6 / -19 | 58 | +3 / 20 | -0.04 / 0.18 |
| Kaikōura | Lyttelton | +17 / +17 | 58 | +2 / 6 | -0.04 / 0.13 |
| New Brighton Pier | Lyttelton | +1 / +1 | 58 | +1 / 7 | -0.07 / 0.24 |
| Sumner Head | Lyttelton | +1 / +1 | 58 | +1 / 3 | -0.08 / 0.16 |
| Akaroa | Lyttelton | -44 / -42 | 58 | +3 / 9 | -0.11 / 0.22 |
| North Cape / Otou | Marsden Point | +13 / +17 | 58 | +1 / 10 | -0.12 / 0.28 |
| Ben Gunn Wharf | Marsden Point | +59 / +82 | 58 | -6 / 15 | -0.05 / 0.23 |
| Opua | Marsden Point | +1 / +0 | 58 | +4 / 10 | -0.06 / 0.20 |
| Korotiti Bay | Marsden Point | -35 / -30 | 58 | +4 / 7 | -0.05 / 0.10 |
| Huruhi Harbour | Marsden Point | -43 / -39 | 58 | +2 / 6 | -0.13 / 0.25 |
| Whangaroa | Marsden Point | +6 / +10 | 58 | -1 / 8 | -0.03 / 0.18 |
| Castlepoint | Napier | -18 / -18 | 59 | -0 / 5 | -0.02 / 0.11 |
| Tarakohe | Nelson | +2 / +8 | 58 | -1 / 7 | -0.01 / 0.10 |
| Elaine Bay | Nelson | -26 / -38 | 58 | +2 / 38 | -0.11 / 0.34 |
| Elie Bay | Nelson | -27 / -40 | 58 | +4 / 48 | -0.03 / 0.24 |
| Richmond Bay | Nelson | -29 / -40 | 58 | +2 / 39 | -0.11 / 0.37 |
| Wilson Bay | Nelson | -24 / -39 | 58 | +1 / 41 | -0.10 / 0.34 |
| Kaiteriteri | Nelson | +1 / +5 | 58 | +1 / 5 | -0.06 / 0.20 |
| Māpua | Nelson | +19 / +19 | 58 | -3 / 22 | +0.04 / 0.25 |
| Paratutae Island | Onehunga | -33 / -28 | 58 | +3 / 10 | -0.05 / 0.17 |
| Anawhata | Onehunga | -61 / -58 | 58 | +3 / 15 | -0.13 / 0.23 |
| Anakakata Bay | Picton | +0 / +13 | 58 | +0 / 17 | -0.09 / 0.19 |
| Long Island | Picton | +0 / +8 | 58 | -2 / 17 | -0.09 / 0.19 |
| Motuara Island | Picton | -3 / +4 | 58 | -3 / 27 | -0.05 / 0.18 |
| Ōkukari Bay | Picton | -56 / -39 | 58 | +6 / 79 | -0.00 / 0.14 |
| Green Island | Port Chalmers | -39 / -38 | 58 | +0 / 7 | -0.00 / 0.11 |
| Spit Wharf | Port Chalmers | -13 / -24 | 58 | -4 / 10 | +0.00 / 0.11 |
| Kawhia | Port Taranaki | +24 / +0 | 58 | -2 / 13 | -0.00 / 0.13 |
| Manu Bay | Port Taranaki | -6 / -9 | 58 | -20 / 23 | -0.03 / 0.19 |
| Raglan | Port Taranaki | +31 / +14 | 58 | +2 / 14 | -0.02 / 0.19 |
| Opononi | Port Taranaki | +7 / +10 | 58 | -3 / 11 | -0.17 / 0.30 |
| Pouto Point | Port Taranaki | +42 / +37 | 58 | -3 / 13 | -0.03 / 0.14 |
| Rangatira Point | Port Taranaki | +3 / +1 | 58 | -5 / 41 | -0.13 / 0.42 |
| Mana Marina | Port Taranaki | +3 / -10 | 58 | -6 / 93 | -0.05 / 0.29 |
| Whanganui River Entrance | Port Taranaki | +20 / +23 | 58 | -5 / 50 | -0.08 / 0.45 |
| Kaituna River Entrance | Tauranga | -18 / +37 | 58 | -4 / 11 | -0.05 / 0.16 |
| Lottin Point / Wakatiri | Tauranga | -37 / -31 | 58 | -1 / 4 | -0.13 / 0.28 |
| Moturiki Island | Tauranga | -23 / -17 | 58 | +1 / 6 | -0.11 / 0.32 |
| Port Ōhope Wharf | Tauranga | +20 / +0 | 58 | -1 / 10 | -0.03 / 0.22 |
| Rangitaiki River Entrance | Tauranga | -13 / +45 | 58 | +2 / 17 | -0.09 / 0.21 |
| Whakatāne | Tauranga | -22 / -8 | 58 | -4 / 9 | -0.16 / 0.35 |
| Whitianga | Tauranga | -6 / -9 | 58 | +6 / 9 | -0.06 / 0.13 |
| Oamaru | Timaru | -5 / -4 | 58 | -27 / 43 | -0.10 / 0.28 |
| Charleston | Westport | +10 / +11 | 58 | +11 / 17 | -0.06 / 0.16 |
| Jackson Bay | Westport | +27 / +30 | 58 | -1 / 9 | -0.00 / 0.13 |
| Deep Cove | Westport | +38 / +41 | 58 | +4 / 38 | -0.02 / 0.20 |
| Fresh Water Basin | Westport | +32 / +36 | 58 | -2 / 12 | -0.14 / 0.26 |
| Welcombe Bay | Westport | +63 / +66 | 58 | -1 / 11 | -0.10 / 0.20 |

Reading:
- **Open-coast sites agree closely:** typically within ±10 min and ±0.2 m. Examples are Green Island, Jackson Bay, Kaikōura, Castlepoint and Akaroa.
- **Errors are larger inside the Sounds, Cook Strait and some harbours.** Max time errors were 79 min at Ōkukari Bay, 93 min at Mana Marina and 38–48 min in Pelorus. Oamaru shows a consistent −27 min bias.
- **Daily sites are therefore preferred:** this is why the 5 km preference exists. Secondary results are labelled as derived in `tide_source`, e.g. `LINZ secondary port Moeraki (offsets from Timaru)`.

## Licence
- **LINZ tide data:** CC BY 4.0, "Contains data sourced from Land Information New Zealand (LINZ)". LINZ says these predictions are **not official tide tables** for Maritime Rules Part 25 and exclude weather effects. Not for navigation.
- **Vendored secondary-ports CSV:** copied byte-for-byte, so attribution travels with it.
