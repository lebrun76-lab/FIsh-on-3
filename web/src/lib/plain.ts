/**
 * Display-side tidy-up for engine sentences: no spaced dashes ("dawn - try",
 * "Poor - stay home", "Maybe — ..."). Engine output is not edited.
 *   "1 Sep - 10 Jan"                       -> "1 Sep to 10 Jan"
 *   "Coromandel Harbour - Whanganui Island" -> "Coromandel Harbour, Whanganui Island" (two proper nouns;
 *                                              port names are normalised to "Area (Place)" before this, see portNames)
 *   "dawn - try snapper"                    -> "dawn. Try snapper"
 *   "Mon 8-11am" (older output)             -> "Mon 8–11am" (unspaced en dash, as engine 2.3 writes it)
 * Unspaced ranges ("5–8am", "soft-baits"), "HW -21 min" and brackets ("Lottin Point (Wakatiri)") are left alone.
 */
const DASH = /(\S+) [-–—] (\S)/g;
const HOUR_RANGE = /\b(\d{1,2}(?::\d\d)?(?:am|pm)?)-(\d{1,2}(?::\d\d)?(?:am|pm))\b/g; // older output "8-11am" -> "8–11am" (2.3 style)
export function plain(s0: string): string {
  const s = s0.replace(HOUR_RANGE, "$1–$2");
  if (!/ [-–—] /.test(s)) return s;
  return s
    .replace(/(\d{1,2} [A-Z][a-z]{2}|\d) [-–—] (?=\d)/g, "$1 to ")
    .replace(DASH, (_m, a: string, b: string) => {
      const word = a.replace(/^[("'“]+/, "");
      if (/^[A-Z]/.test(word) && /^[("'“]?[A-Z]/.test(b) && !/^(Excellent|Good|Poor|Marginal|Maybe|Fair)$/.test(word)) return `${a}, ${b}`;
      return `${a.replace(/[,;:.]$/, "")}. ${b.toUpperCase()}`;
    });
}

const SKIP = new Set(["id", "time", "start", "end", "date", "generated_at", "valid_until", "remaining_from", "sunrise", "sunset", "url", "href", "engine_version", "tide_port_linz_name"]);
/** Apply `plain` to every human-readable string in a payload (ids and timestamps skipped). */
export function plainDeep<T>(x: T, key = ""): T {
  if (typeof x === "string") return (SKIP.has(key) || key.endsWith("_id") ? x : plain(x)) as T;
  if (Array.isArray(x)) return x.map((v) => plainDeep(v, key)) as T;
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plainDeep(v, k)])) as T;
  return x;
}

/** LINZ writes some ports as "Area - Place". Engine 2.3 shows them as "Area (Place)" and keeps the raw
 *  name in spot.tide_port_linz_name. For older output, do the same here so every page reads alike. */
export const linzDisplayName = (raw: string) => raw.replace(/^(.+?) - (.+)$/, "$1 ($2)");
export function portNames<T extends { spot: { tide_port?: string | null; tide_port_linz_name?: string | null } }>(f: T): T {
  const raw = f.spot.tide_port;
  if (f.spot.tide_port_linz_name !== undefined || !raw || !/ - /.test(raw)) return f;
  const shown = linzDisplayName(raw);
  const out = JSON.parse(JSON.stringify(f).split(JSON.stringify(raw).slice(1, -1)).join(JSON.stringify(shown).slice(1, -1))) as T;
  out.spot.tide_port_linz_name = raw;
  return out;
}

/** "LINZ secondary port Coromandel Harbour (Whanganui Island) (offsets from Auckland)" + 5.8 km
 *  -> "LINZ secondary port Coromandel Harbour (Whanganui Island), offsets from Auckland, 5.8 km away". */
export function tideSourceText(src: string, km?: number | null): string {
  const s = src.replace(/ \((offsets from [^()]+)\)$/, ", $1");
  return km != null ? `${s}, ${km} km away` : s;
}
