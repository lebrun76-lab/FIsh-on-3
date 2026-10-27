/**
 * NZ sea-surface-temperature map (server side). Written by the scheduled job
 * (jobs/run_forecasts.py -> fishon_engine.sstmap -> web/data/sst/latest.json,
 * = Supabase sst_maps.payload). One batched Open-Meteo request per refresh
 * counts as ~663 location-calls against the plan quota, so it is refreshed
 * with the forecasts (engine caches it 6 h), never per page view.
 * Live: api/refresh_forecasts.py stores a new map in Supabase sst_maps (at most every ~6 h);
 * we read the newest row through the Next data cache (tag "forecasts") and use whichever of it
 * or the committed file is newer.
 */
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { dirWord } from "./view";
import { publicSupabaseAnonKey, publicSupabaseUrl } from "./supabase/config";

export interface SstSpot { sst_c: number | null; cell_km: number | null; marine_point: [number, number]; isotherms_near: number[]; edge: null | { min_c: number; max_c: number; delta_c: number; warm_km: number; warm_cell: [number, number]; warm_dir: string } }
export interface SstMapData {
  valid_time_nz: string; valid_text: string;
  bbox: { south: number; north: number; west: number; east: number }; step: number;
  lats: number[]; lons: number[]; sst: (number | null)[][];
  isotherms: Record<string, [number, number][][]>; land: [number, number][][];
  notes: string[]; fronts: { text: string }[]; spots: Record<string, SstSpot>;
  api_calls_counted: number; attribution: string; caveats: string[];
  range?: [number, number];                  // colour scale of the full map
  focus?: { lat: number; lon: number; name: string };
}

const FILE = process.env.SALTSUPPLY_SST_FILE ?? process.env.FISHCAST_SST_FILE /* deprecated */ ?? path.join(process.cwd(), "data", "sst", "latest.json");

async function dbSst(): Promise<SstMapData | null> {
  const url = publicSupabaseUrl(), key = publicSupabaseAnonKey();
  if (!url || !key) return null;
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/sst_maps?select=payload&order=valid_time.desc&limit=1`, {
      headers: { apikey: key }, next: { revalidate: 3 * 3600, tags: ["forecasts", "sst"] }, signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const rows = (await r.json()) as { payload: SstMapData | null }[];
    return rows[0]?.payload ?? null;
  } catch { return null; }
}

function fileSst(): SstMapData | null {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")) as SstMapData; } catch { return null; }
}

const t = (m: SstMapData) => Date.parse(m.valid_time_nz) || 0;

export const loadSst = cache(async (): Promise<SstMapData | null> => {
  const maps = [await dbSst(), fileSst()].filter((m): m is SstMapData => !!m && Array.isArray(m.sst) && m.sst.flat().some((x) => x !== null));
  const m = maps.sort((a, b) => t(b) - t(a))[0];
  if (!m) return null;
  const v = m.sst.flat().filter((x): x is number => x !== null);
  return { ...m, range: [Math.floor(Math.min(...v)), Math.ceil(Math.max(...v))] };
});

/** Crop to a window around a spot so the spot page ships ~10 KB, not the whole country. */
export function cropSst(m: SstMapData, lat: number, lon: number, name: string, dLat = 2.5, dLon = 3.2): SstMapData {
  const bbox = { south: Math.max(m.bbox.south, lat - dLat), north: Math.min(m.bbox.north, lat + dLat), west: Math.max(m.bbox.west, lon - dLon), east: Math.min(m.bbox.east, lon + dLon) };
  const pad = m.step;
  const li = m.lats.map((y, i) => [y, i] as const).filter(([y]) => y >= bbox.south - pad && y <= bbox.north + pad);
  const lj = m.lons.map((x, j) => [x, j] as const).filter(([x]) => x >= bbox.west - pad && x <= bbox.east + pad);
  const inBox = ([x, y]: [number, number]) => x >= bbox.west - 1 && x <= bbox.east + 1 && y >= bbox.south - 1 && y <= bbox.north + 1;
  return {
    ...m, bbox, focus: { lat, lon, name },
    lats: li.map(([y]) => y), lons: lj.map(([x]) => x),
    sst: li.map(([, i]) => lj.map(([, j]) => m.sst[i][j])),
    land: m.land.filter((r) => r.some(inBox)),
    isotherms: Object.fromEntries(Object.entries(m.isotherms).map(([k, segs]) => [k, segs.filter((s) => s.some(inBox))]).filter(([, s]) => s.length)),
    notes: [], fronts: [], spots: {},
  };
}

/** Plain-English caption for one spot. */
export function spotCaption(m: SstMapData, id: string, name: string): string[] {
  const s = m.spots[id];
  if (!s || s.sst_c === null) return [`No sea-temperature reading close to ${name} on this map.`];
  const out = [`The water off ${name} is about ${s.sst_c}°C.`];
  if (s.edge) out.push(`There’s a temperature break nearby: within 75 km the water goes from ${s.edge.min_c}°C to ${s.edge.max_c}°C, and the warmest water is about ${s.edge.warm_km} km to the ${dirWord(s.edge.warm_dir)}. Bait and the fish chasing it often gather along breaks like this, so work the warm side.`);
  else out.push("No strong temperature break within 75 km: the water is fairly even, so fish structure, tide and bait rather than a temperature line.");
  if (s.isotherms_near.length) out.push(`The ${s.isotherms_near.map((x) => `${x}°C`).join(" and ")} line${s.isotherms_near.length > 1 ? "s run" : " runs"} close by.`);
  return out;
}

/** Plain-English caption for the whole country. */
export function nzCaption(m: SstMapData): string[] {
  const out = [m.notes[0]].filter(Boolean);
  if (m.fronts.length) out.push(`Biggest temperature breaks: ${m.fronts.slice(0, 3).map((f) => f.text.replace(/^Temperature front /, "").replace(/, warmer water to the (\w+)\.?$/, " (warmer to the $1)")).join("; ")}.`);
  return out;
}
