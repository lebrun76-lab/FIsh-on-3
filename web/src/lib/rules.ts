/**
 * SAMPLE rules / closures / species data for the prototype ONLY.
 * Values are illustrative and NOT verified. Production must source these from
 * MPI (NZ Fishing Rules) / DOC marine reserve data and show "last checked" dates.
 */
export interface Species { id: string; name: string; maori?: string; minSizeCm: number | null; dailyBag: number | null; season: string; tactics: string; water: "salt" | "fresh"; }
export const SPECIES: Species[] = [
  { id: "snapper", name: "Snapper", maori: "Tāmure", minSizeCm: 30, dailyBag: 7, season: "Best Oct–Apr as water warms past ~16°C", tactics: "Soft baits or strayline lightly weighted pilchard into berley, 5–20 m over reef edges and around the tide change.", water: "salt" },
  { id: "kahawai", name: "Kahawai", minSizeCm: null, dailyBag: 10, season: "Year round; work-ups in summer", tactics: "Cast small metal lures at work-ups and river mouths; troll lures slowly along foam lines.", water: "salt" },
  { id: "kingfish", name: "Kingfish", maori: "Haku", minSizeCm: 75, dailyBag: 3, season: "Nov–Apr", tactics: "Live bait or jigs over pinnacles and structure; strong gear and heavy drag.", water: "salt" },
  { id: "blue_cod", name: "Blue cod", maori: "Rāwaru", minSizeCm: 33, dailyBag: 2, season: "Rules vary by area. Some seasonal closures", tactics: "Ledger rig with squid or fish bait on foul ground in 15–40 m. Use circle hooks; release undersize fast.", water: "salt" },
  { id: "tarakihi", name: "Tarakihi", minSizeCm: 25, dailyBag: 10, season: "Year round", tactics: "Small hooks, shellfish or squid strip on sandy patches near reef in 30–80 m.", water: "salt" },
  { id: "gurnard", name: "Red gurnard", maori: "Kumukumu", minSizeCm: 25, dailyBag: null, season: "Year round over sand", tactics: "Drift over sand and mud with flasher rigs and fresh bait.", water: "salt" },
  { id: "trout", name: "Brown / rainbow trout", minSizeCm: null, dailyBag: null, season: "Season and limits set by Fish & Game region. Licence required", tactics: "Early and late in the day; nymph or wet fly near drop-offs and stream mouths.", water: "fresh" },
];
export interface Closure { id: string; name: string; type: "Marine reserve" | "Seasonal closure" | "Rāhui" | "Area rule"; lat: number; lon: number; rule: string; }
export const CLOSURES: Closure[] = [
  { id: "goat_island", name: "Cape Rodney–Okakari Point (Goat Island)", type: "Marine reserve", lat: -36.27, lon: 174.8, rule: "No fishing or taking of anything." },
  { id: "poor_knights", name: "Poor Knights Islands", type: "Marine reserve", lat: -35.47, lon: 174.74, rule: "No fishing within the reserve." },
  { id: "hauraki_scallops", name: "Hauraki Gulf & Coromandel scallops", type: "Seasonal closure", lat: -36.6, lon: 175.3, rule: "Scallop harvest closed (check current status)." },
  { id: "te_tapuwae", name: "Te Tapuwae o Rongokako", type: "Marine reserve", lat: -38.8, lon: 178.05, rule: "No fishing within the reserve." },
  { id: "tonga_island", name: "Tonga Island (Abel Tasman)", type: "Marine reserve", lat: -40.89, lon: 173.06, rule: "No fishing within the reserve." },
  { id: "hikurangi", name: "Hikurangi (Kaikōura)", type: "Marine reserve", lat: -42.5, lon: 173.6, rule: "No fishing within the reserve." },
  { id: "marlborough_cod", name: "Marlborough Sounds blue cod", type: "Area rule", lat: -41.1, lon: 174.0, rule: "Blue cod bag and size limits differ here." },
  { id: "fiordland", name: "Fiordland internal waters", type: "Area rule", lat: -45.4, lon: 167.2, rule: "Lower bag limits and several reserves." },
];
export const speciesFor = (names: string[]) => names.map((n) => SPECIES.find((s) => n.toLowerCase().includes(s.name.toLowerCase().split(" ")[0].toLowerCase()) || (s.id === "trout" && /trout/i.test(n)))).filter(Boolean) as Species[];
export const sizeText = (s?: Species) => (!s ? "" : s.minSizeCm ? `legal size ${s.minSizeCm} cm` : "no min. size");
