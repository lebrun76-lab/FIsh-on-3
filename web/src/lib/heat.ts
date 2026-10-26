// Shaded sea for the spots map: a weather-map style ring of colour round each island.
// Each stretch of water takes the rating of its nearest coastal spot (by that spot's forecast point),
// so the sea right off a spot always matches its marker. Neighbours meet along the line halfway
// between them, with a narrow soft blend there only. Cut into the four rating bands. Nothing fades
// to blank: water far from any spot is just a bit lighter. Only water within COAST_KM of the
// coastline is kept, and the land is drawn over it, so it shows on the sea only.
import type { Rating } from "./types";
import { ratingFor } from "./call";
import { ISLAND_BOUNDS, NZ_LAND_PATH, project } from "./nzmap";

/** Band colours: the same flat greens to red as the rating dots (Tailwind 500/400). */
export const BAND_RGB: Record<Rating, [number, number, number]> = { great: [16, 185, 129], good: [132, 204, 22], marginal: [251, 191, 36], poor: [244, 63, 94] };
export const BAND_ALPHA = 0.42;
/** Shading reaches this far offshore from the coastline. */
export const COAST_KM = 35;
/** Full colour within FULL_KM of a forecast point, easing down to FAR_ALPHA of it by FADE_KM. Never blank. */
export const FULL_KM = 40, FADE_KM = 120, FAR_ALPHA = 0.6;
/** Neighbours blend where the two distances differ by less than this (about BLEND_KM/2 either side of the halfway line). */
export const BLEND_KM = 8;
/** Map units per grid cell (1 unit = 0.01 deg of longitude, about 0.8 to 0.9 km here). */
const CELL = 2;

export interface HeatSource { x: number; y: number; v: number }
export interface HeatField { canvas: HTMLCanvasElement; x0: number; y0: number; w: number; h: number }

/** km per map unit around an island (Mercator, so it depends on latitude). */
export const kmPerUnit = (island: "North" | "South") => {
  const [, n, , s] = ISLAND_BOUNDS[island];
  return 1.11319 * Math.cos((((n + s) / 2) * Math.PI) / 180);
};

/** The nearest and second-nearest sources at one point (distances in map units). Pure, for tests.
 *  Nearest-spot ownership: the nearest spot owns the water; the runner-up only matters at the border. */
export function ownerAt(x: number, y: number, src: HeatSource[]): { v: number; dmin: number; v2: number | null; d2: number } {
  let v = 0, a = Infinity, v2: number | null = null, b = Infinity;
  for (const p of src) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < a) { b = a; v2 = v; a = d; v = p.v; } else if (d < b) { b = d; v2 = p.v; }
  }
  return { v, dmin: Math.sqrt(a), v2: Number.isFinite(b) ? v2 : null, d2: Math.sqrt(b) };
}

/** Opacity factor for water dmin km from the nearest forecast point: 1 near spots, never below FAR_ALPHA. */
export const fadeAt = (km: number) => (km <= FULL_KM ? 1 : km >= FADE_KM ? FAR_ALPHA : 1 - ((1 - FAR_ALPHA) * (km - FULL_KM)) / (FADE_KM - FULL_KM));

/** How much of the runner-up's colour mixes in: 0.5 on the halfway line, 0 once BLEND_KM clear of it. */
export const blendAt = (gapKm: number) => { const u = Math.min(1, gapKm / BLEND_KM); return 0.5 * (1 - u * u * (3 - 2 * u)); };

export const sourcesOf = (pts: { lat: number; lon: number; v: number }[]): HeatSource[] =>
  pts.map((p) => { const [x, y] = project(p.lon, p.lat); return { x, y, v: p.v }; });

export interface HeatGrid { x0: number; y0: number; cols: number; rows: number; cell: number; px: Uint8ClampedArray }

/** The coloured grid for one island before the coast clip (RGBA per cell). Pure, for tests. */
export function heatGrid(island: "North" | "South", src: HeatSource[]): HeatGrid {
  const kpu = kmPerUnit(island), pad = (COAST_KM + 10) / kpu;
  const [west, north, east, south] = ISLAND_BOUNDS[island];
  const [ax, ay] = project(west, north), [bx, by] = project(east, south);
  const x0 = ax - pad, y0 = ay - pad, cols = Math.ceil((bx - ax + 2 * pad) / CELL), rows = Math.ceil((by - ay + 2 * pad) / CELL);
  const px = new Uint8ClampedArray(cols * rows * 4);
  if (src.length) {
    for (let j = 0; j < rows; j++) {
      const y = y0 + (j + 0.5) * CELL;
      for (let i = 0; i < cols; i++) {
        const x = x0 + (i + 0.5) * CELL;
        const { v, dmin, v2, d2 } = ownerAt(x, y, src);
        const own = BAND_RGB[ratingFor(v)], k = (j * cols + i) * 4;
        const w = v2 == null ? 0 : blendAt((d2 - dmin) * kpu), other = v2 == null ? own : BAND_RGB[ratingFor(v2)];
        for (let c = 0; c < 3; c++) px[k + c] = Math.round(own[c] * (1 - w) + other[c] * w);
        px[k + 3] = Math.round(255 * BAND_ALPHA * fadeAt(dmin * kpu));
      }
    }
  }
  return { x0, y0, cols, rows, cell: CELL, px };
}

/** The band colour drawn at map point (x, y), or null where nothing is drawn. */
export function bandAt(g: HeatGrid, x: number, y: number): Rating | null {
  const i = Math.floor((x - g.x0) / g.cell), j = Math.floor((y - g.y0) / g.cell);
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return null;
  const k = (j * g.cols + i) * 4;
  if (!g.px[k + 3]) return null;
  return (Object.keys(BAND_RGB) as Rating[]).find((r) => BAND_RGB[r][0] === g.px[k] && BAND_RGB[r][1] === g.px[k + 1] && BAND_RGB[r][2] === g.px[k + 2]) ?? null;
}

/** Draws the field for one island into an offscreen canvas in map units (browser only). */
export function buildField(island: "North" | "South", src: HeatSource[]): HeatField | null {
  if (typeof document === "undefined") return null;
  const kpu = kmPerUnit(island);
  const { x0, y0, cols, rows, px } = heatGrid(island, src);
  const canvas = document.createElement("canvas");
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(cols, rows);
  img.data.set(px);
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
