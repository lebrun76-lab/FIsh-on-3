/**
 * Display-side tidy-up for engine sentences: no spaced dashes ("dawn - try",
 * "Poor - stay home", "Maybe — ..."). Engine output is not edited.
 *   "1 Sep - 10 Jan"                       -> "1 Sep to 10 Jan"
 *   "Coromandel Harbour - Whanganui Island" -> "Coromandel Harbour, Whanganui Island" (two proper nouns)
 *   "dawn - try snapper"                    -> "dawn. Try snapper"
 * Unspaced ranges ("5–8am", "soft-baits") and "HW -21 min" are left alone.
 */
const DASH = /(\S+) [-–—] (\S)/g;
export function plain(s: string): string {
  if (!/ [-–—] /.test(s)) return s;
  return s
    .replace(/(\d{1,2} [A-Z][a-z]{2}|\d) [-–—] (?=\d)/g, "$1 to ")
    .replace(DASH, (_m, a: string, b: string) => {
      if (/^[A-Z]/.test(a) && /^[A-Z]/.test(b) && !/^(Excellent|Good|Poor|Marginal|Maybe|Fair)$/.test(a)) return `${a}, ${b}`;
      return `${a.replace(/[,;:.]$/, "")}. ${b.toUpperCase()}`;
    });
}

const SKIP = new Set(["id", "time", "start", "end", "date", "generated_at", "sunrise", "sunset", "url", "href"]);
/** Apply `plain` to every human-readable string in a payload (ids and timestamps skipped). */
export function plainDeep<T>(x: T, key = ""): T {
  if (typeof x === "string") return (SKIP.has(key) || key.endsWith("_id") ? x : plain(x)) as T;
  if (Array.isArray(x)) return x.map((v) => plainDeep(v, key)) as T;
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plainDeep(v, k)])) as T;
  return x;
}
