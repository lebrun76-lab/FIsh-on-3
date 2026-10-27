"""Simplify the DOC Marine Reserves GeoJSON for the site map.

Source: DOC open data, "DOC Marine Reserves" (item 8c8b619c000f449dadb69d2103424bd1), CC BY 4.0.
Usage: python3 scripts/simplify-reserves.py raw.geojson data/doc-marine-reserves.json

Keeps reserves around the North, South and Stewart Islands (drops the Kermadec and
subantarctic ones, which are off the map), simplifies each ring with Douglas-Peucker in
the site's map projection (about 150 m tolerance), drops slivers, and rounds to 4 dp.
"""
import json, math, sys

K = 100
def my(lat): return math.log(math.tan(math.pi / 4 + lat * math.pi / 360)) * 180 / math.pi
Y0 = my(-34)
def proj(p): return ((p[0] - 166) * K, (Y0 - my(p[1])) * K)
TOL = 0.15          # map units (100 per degree of longitude) ≈ 150 m
MIN_AREA = 0.0004   # map units² ≈ 4 ha: rings smaller than this are dropped (tiny rock holes)

def dp(pts, xy, tol):
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = xy[a], xy[b]
        L = math.hypot(bx - ax, by - ay) or 1e-12
        best, idx = 0, -1
        for i in range(a + 1, b):
            px, py = xy[i]
            d = abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / L
            if d > best: best, idx = d, i
        if best > tol and idx > 0:
            keep[idx] = True; stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]

def area(xy): return abs(sum(xy[i][0] * xy[i - 1][1] - xy[i - 1][0] * xy[i][1] for i in range(len(xy)))) / 2

def ring(r, outer):
    xy = [proj(p) for p in r]
    if not outer and area(xy) < MIN_AREA: return None
    def simp(tol):
        # A closed ring starts and ends on the same point, so split it at the vertex farthest from the start.
        far = max(range(len(xy)), key=lambda i: (xy[i][0] - xy[0][0]) ** 2 + (xy[i][1] - xy[0][1]) ** 2)
        return dp(r[:far + 1], xy[:far + 1], tol)[:-1] + dp(r[far:], xy[far:], tol)
    s = simp(TOL)
    if len(s) < 5:  # keep tiny reserves as a small polygon rather than losing them
        s = simp(TOL / 10)
        if len(s) < 5: s = r
    return [[round(x, 4), round(y, 4)] for x, y in s]

raw = json.load(open(sys.argv[1]))
out = []
for f in raw["features"]:
    p, g = f["properties"], f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    lon, lat = polys[0][0][0]
    if not (166 <= lon <= 179 and -48 <= lat <= -34): continue
    newp = []
    for poly in polys:
        o = ring(poly[0], True)
        if area([proj(q) for q in poly[0]]) < MIN_AREA / 4 and len(polys) > 1: continue  # drop specks of multi-part reserves
        holes = [h for h in (ring(r, False) for r in poly[1:]) if h]
        newp.append([o] + holes)
    out.append({"type": "Feature", "properties": {"name": p["Name"], "napalis_id": p["NaPALIS_ID"]},
                "geometry": {"type": "MultiPolygon", "coordinates": newp}})
out.sort(key=lambda f: f["properties"]["name"])
json.dump({"type": "FeatureCollection", "features": out}, open(sys.argv[2], "w"), separators=(",", ":"), ensure_ascii=False)
print(len(out), "reserves,", sum(len(r) for f in out for poly in f["geometry"]["coordinates"] for r in poly), "points")
