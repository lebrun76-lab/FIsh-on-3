/**
 * "Can I keep it?" logic. Data: src/data/catch-rules.json, hand-entered from MPI pages and the
 * Fisheries (Recreational Management Controls) Notice No.1 2026. Rebuild with scripts/catch-rules/build.py.
 * A guide only. The panel never says a fish can be kept, only what the rule is.
 */
import data from "@/data/catch-rules.json";

export type MinSize = number | "none" | null;
export type Daily = number | "combined" | "no-take" | null;
export interface CatchRow {
  id: string; zone: string; species: string; minSizeCm: MinSize; dailyLimit: Daily;
  shared: string | null; accumulation: string | null; closure: { from: string; to: string; text: string } | null;
  landedState: string | null; notes: string[]; sourceUrl: string; noticeUrl: string | null; noticePart: string | null;
  lastReviewedOnSource: string; dateChecked: string; verified: boolean;
}
export interface CatchZone { id: string; name: string; fma: string; combinedDaily: number; notes: string[]; sourceUrl: string; lastReviewedOnSource: string }
export interface CatchSpecies { id: string; name: string; maori: string | null }
export interface SpotRules { spotId: string; note: string | null; freshwater: boolean; options: { zone: string; label: string | null }[] }

export const CATCH_SPECIES = data.species as CatchSpecies[];
export const CATCH_ZONES = data.zones as CatchZone[];
const ROWS = data.rows as CatchRow[];
const SPOT_RULES = data.spots as SpotRules[];
export const MPI_ATTRIBUTION = data.attribution;
export const STALE_DAYS = 60;
export const LINKS = {
  mpiRules: "https://www.mpi.govt.nz/fishing-aquaculture/recreational-fishing/fishing-rules/",
  mpiApp: "https://www.mpi.govt.nz/fishing-aquaculture/recreational-fishing/nz-fishing-rules-app",
  mpiClosures: "https://www.mpi.govt.nz/fishing-aquaculture/maori-customary-fishing/customary-fisheries-management-areas-rules-and-maps",
  docReserves: "https://www.doc.govt.nz/marinereserves",
  fishAndGame: "https://www.fishandgame.org.nz/freshwater-fishing-in-new-zealand/fishing-licences-and-regulations/",
  ccBy: "https://creativecommons.org/licenses/by/4.0/",
};

export const zoneById = (id: string) => CATCH_ZONES.find((z) => z.id === id);
export const rowFor = (zone: string, species: string) => ROWS.find((r) => r.zone === zone && r.species === species);
export const spotRules = (spotId: string) => SPOT_RULES.find((s) => s.spotId === spotId);

/** Map the free-text species names on a spot to rule species ids. Shellfish and plain "Tuna" have no row. */
export function speciesIdsFor(names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    const s = n.toLowerCase();
    const id = s.includes("blue cod") ? "blue_cod" : s.includes("bluenose") ? "bluenose" : s.includes("bluefin") ? "sbt"
      : /hapuku|hāpuku|groper|\bbass\b/.test(s) ? "hapuku_bass" : s.includes("gurnard") ? "red_gurnard" : s.includes("john dory") ? "john_dory"
      : ["snapper", "kingfish", "kahawai", "trevally", "tarakihi", "barracouta", "flatfish"].find((k) => s.includes(k)) ?? (s.includes("moki") ? "blue_moki" : null);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

const daysBetween = (a: string, b: Date) => (b.getTime() - new Date(`${a}T00:00:00+13:00`).getTime()) / 86_400_000;
export const isStale = (r: CatchRow, now = new Date()) => daysBetween(r.dateChecked, now) > STALE_DAYS;
/** True when we can show the numbers: nothing null and checked in the last 60 days. */
export const showable = (r?: CatchRow, now = new Date()): r is CatchRow => !!r && r.minSizeCm !== null && r.dailyLimit !== null && !isStale(r, now);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const md = (s: string) => { const [m, d] = s.split("-").map(Number); return { m, d, n: m * 100 + d, text: `${d} ${MONTHS[m - 1]}` }; };
/** NZ date as MMDD number. */
const nzMd = (now: Date) => {
  const p = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", month: "numeric", day: "numeric" }).formatToParts(now);
  return Number(p.find((x) => x.type === "month")!.value) * 100 + Number(p.find((x) => x.type === "day")!.value);
};
export function closedNow(r: CatchRow, now = new Date()) {
  if (!r.closure) return null;
  const a = md(r.closure.from), b = md(r.closure.to), t = nzMd(now);
  const inside = a.n <= b.n ? t >= a.n && t <= b.n : t >= a.n || t <= b.n;
  return inside ? { until: b.text, text: r.closure.text } : null;
}

export function minText(r: CatchRow) { return r.minSizeCm === "none" ? "No minimum size" : `Minimum ${r.minSizeCm} cm`; }
export function dailyText(r: CatchRow, z?: CatchZone) {
  if (r.dailyLimit === "no-take") return "No take here";
  if (r.dailyLimit === "combined") return z ? `No separate limit. Counts toward the ${z.combinedDaily} finfish a day total` : "No separate limit. Counts toward the area total";
  return `Daily limit ${r.dailyLimit}`;
}

export type Tone = "back" | "limit" | "check" | "info";
/** The verdict line. Never says the fish can be kept. */
export function verdict(r: CatchRow | undefined, z: CatchZone | undefined, lengthCm: number | null, now = new Date()): { tone: Tone; text: string } {
  if (!showable(r, now)) return { tone: "check", text: "We can't confirm this one. Check the MPI rules before you keep it." };
  const shut = closedNow(r, now);
  if (shut) return { tone: "back", text: `Closed here until ${shut.until}. Put it back.` };
  if (r.dailyLimit === "no-take") return { tone: "back", text: "No take here. Put it back." };
  const lim = r.dailyLimit === "combined" ? `No separate limit, it counts toward the ${z ? `${z.combinedDaily} finfish` : "area"} total.` : `Daily limit ${r.dailyLimit}.`;
  if (lengthCm === null || !Number.isFinite(lengthCm) || lengthCm <= 0) return { tone: "info", text: `${minText(r)}. ${lim}` };
  const min = r.minSizeCm;
  if (min === null) return { tone: "check", text: "We can't confirm this one. Check the MPI rules before you keep it." };
  if (min === "none") return { tone: "limit", text: `No minimum size. ${lim}` };
  if (lengthCm < min) return { tone: "back", text: `Under the ${min} cm minimum, put it back.` };
  if (lengthCm === min) return { tone: "limit", text: `Right on the ${min} cm minimum. ${lim}` };
  return { tone: "limit", text: `Over the minimum. ${lim}` };
}
