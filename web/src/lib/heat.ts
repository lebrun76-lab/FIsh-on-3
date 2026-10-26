// Shaded sea for the spots map: a weather-map style layer built from our own ratings.
// Each coastal spot's score (for the picked day or half-day) is spread across nearby water by
// inverse-distance weighting from its forecast point, cut into the four rating bands, and faded
// out with distance from the nearest spot so coast with no spot nearby stays blank. Only water
// within COAST_KM of the coastline is kept; the land is drawn over it, so it shows on the sea only.
import type { Rating } from "./types";
import { ratingFor } from "./call";
import { ISLAND_BOUNDS, NZ_LAND_PATH, project } from "./nzmap";

/** Band colours: the same flat greens to red as the rating dots (Tailwind 500/400). */
export const BAND_RGB: Record<Rating, [number, number, number]> = { great: [16, 185, 129], good: [132, 204, 22], marginal: [251, 191, 36], poor: [244, 63, 94] };
export const BAND_ALPHA = 0.42;
/** Shading reaches this far offshore from the coastline. */
export const COAST_KM = 35;
/** Full colour within FULL_KM of a forecast point, fading to nothing at FADE_KM. */
export const FULL_KM = 40, FADE_KM = 80;
/** Map units per grid cell (1 unit = 0.01 deg of longitude, about 0.8 to 0.9 km here). */
const CELL = 2;

export interface HeatSource { x: number; y: number; v: number }
export interface HeatField { canvas: HTMLCanvasElement; x0: number; y0: number; w: number; h: number }

/** km per map unit around an island (Mercator, so it depends on latitude). */
export const kmPerUnit = (island: "North" | "South") => {
  const [, n, , s] = ISLAND_BOUNDS[island];
  return 1.11319 * Math.cos((((n + s) / 2) * Math.PI) / 180);
};

/** IDW value and distance to the nearest source (both in map units) at one point. Pure, for tests. */
export function idwAt(x: number, y: number, src: HeatSource[]): { v: number; dmin: number } {
  let num = 0, den = 0, dmin = Infinity;
  for (const p of src) {
    const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d2 < 1e-6) return { v: p.v, dmin: 0 };
    const w = 1 / d2;
    num += w * p.v; den += w;
    if (d2 < dmin) dmin = d2;
  }
  return { v: den ? num / den : 0, dmin: Math.sqrt(dmin) };
}

/** Opacity for a point dmin km from the nearest forecast point. */
export const fadeAt = (km: number) => (km <= FULL_KM ? 1 : km >= FADE_KM ? 0 : (FADE_KM - km) / (FADE_KM - FULL_KM));

export const sourcesOf = (pts: { lat: number; lon: number; v: number }[]): HeatSource[] =>
  pts.map((p) => { const [x, y] = project(p.lon, p.lat); return { x, y, v: p.v }; });

/** Draws the field for one island into an offscreen canvas in map units (browser only). */
export function buildField(island: "North" | "South", src: HeatSource[]): HeatField | null {
  if (typeof document === "undefined") return null;
  const kpu = kmPerUnit(island), pad = (COAST_KM + 10) / kpu;
  const [west, north, east, south] = ISLAND_BOUNDS[island];
  const [ax, ay] = project(west, north), [bx, by] = project(east, south);
  const x0 = ax - pad, y0 = ay - pad, cols = Math.ceil((bx - ax + 2 * pad) / CELL), rows = Math.ceil((by - ay + 2 * pad) / CELL);
  const canvas = document.createElement("canvas");
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const reach = FADE_KM / kpu;
  const near = src.filter((p) => p.x > x0 - reach && p.x < x0 + cols * CELL + reach && p.y > y0 - reach && p.y < y0 + rows * CELL + reach);
  const img = ctx.createImageData(cols, rows), px = img.data;
  if (near.length) {
    for (let j = 0; j < rows; j++) {
      const y = y0 + (j + 0.5) * CELL;
      for (let i = 0; i < cols; i++) {
        const x = x0 + (i + 0.5) * CELL;
        const { v, dmin } = idwAt(x, y, near);
        const a = fadeAt(dmin * kpu);
        if (a <= 0) continue;
        const [r, g, b] = BAND_RGB[ratingFor(v)], k = (j * cols + i) * 4;
        px[k] = r; px[k + 1] = g; px[k + 2] = b; px[k + 3] = Math.round(255 * BAND_ALPHA * a);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  // Keep only water near the coast: a thick stroke along the coastline is the mask.
  const mask = document.createElement("canvas");
  mask.width = cols; mask.height = rows;
  const m = mask.getContext("2d");
  if (m) {
    m.setTransform(1 / CELL, 0, 0, 1 / CELL, -x0 / CELL, -y0 / CELL);
    m.lineWidth = (2 * COAST_KM) / kpu; m.lineJoin = "round"; m.lineCap = "round";
    const land = new Path2D(NZ_LAND_PATH);
    m.stroke(land); m.fill(land);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
  }
  return { canvas, x0, y0, w: cols * CELL, h: rows * CELL };
}
