/** DOC marine reserves, bundled statically (data/doc-marine-reserves.json, CC BY 4.0).
 * See data/doc-marine-reserves.meta.json for the source and scripts/simplify-reserves.py for processing. */
import data from "../../data/doc-marine-reserves.json";
import meta from "../../data/doc-marine-reserves.meta.json";
import { project } from "./nzmap";

type Ring = number[][];
type Feature = { properties: { name: string; napalis_id: number }; geometry: { coordinates: Ring[][] } };
const FEATURES = (data as { features: Feature[] }).features;

export type Reserve = {
  id: string;
  name: string;
  /** SVG path in map units (see nzmap.project). */
  d: string;
  /** Map-unit bounds [x0, y0, x1, y1] and the centre of the biggest part, for the zoomed-out marker. */
  box: [number, number, number, number];
  cx: number;
  cy: number;
};

export const RESERVES: Reserve[] = FEATURES.map((f) => {
  let d = "", x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, big = -1, cx = 0, cy = 0;
  for (const poly of f.geometry.coordinates) {
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      });
      d += "Z";
    }
    const pts = poly[0].map(([lon, lat]) => project(lon, lat));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const a = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (a > big) { big = a; cx = (Math.max(...xs) + Math.min(...xs)) / 2; cy = (Math.max(...ys) + Math.min(...ys)) / 2; }
  }
  return { id: String(f.properties.napalis_id), name: f.properties.name, d, box: [x0, y0, x1, y1], cx, cy };
});

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const RESERVES_CREDIT = `Marine reserves: Department of Conservation, CC BY 4.0, data as at ${fmt(meta.data_as_at)}`;
export const RESERVES_META = meta;

/** Shortest distance in km from a point to a ring (0 if inside). Flat-earth approximation, fine at this scale. */
function ringKm(lat: number, lon: number, ring: Ring): { km: number; inside: boolean } {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57;
  const p = ring.map(([x, y]) => [(x - lon) * kx, (y - lat) * ky]);
  let best = Infinity, inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ax, ay] = p[j], [bx, by] = p[i];
    if (ay > 0 !== by > 0 && ax + ((0 - ay) * (bx - ax)) / (by - ay) > 0) inside = !inside;
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return { km: best, inside };
}

/** Reserves within `km` of a point, nearest first. */
export function reservesNear(lat: number, lon: number, km = 6): { name: string; km: number }[] {
  const out: { name: string; km: number }[] = [];
  for (const f of FEATURES) {
    let d = Infinity;
    for (const poly of f.geometry.coordinates) {
      const r = ringKm(lat, lon, poly[0]);
      d = Math.min(d, r.inside ? 0 : r.km);
    }
    if (d <= km) out.push({ name: f.properties.name, km: d });
  }
  return out.sort((a, b) => a.km - b.km);
}
