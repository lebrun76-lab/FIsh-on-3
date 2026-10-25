import type { HourPoint } from "./types";
export type Safety = "ok" | "caution" | "no";
/** Combined wind + swell check for small boats / rock fishing. Thresholds are proposed defaults. */
export function safetyCheck(hours: HourPoint[], coastal: boolean): { level: Safety; text: string } {
  const light = hours.filter((h) => { const hh = Number(h.time.slice(11, 13)); return hh >= 5 && hh <= 20; });
  const maxW = Math.max(...light.map((h) => h.wind_kn ?? 0));
  const maxG = Math.max(...light.map((h) => h.gust_kn ?? 0));
  const maxS = coastal ? Math.max(...light.map((h) => h.swell_m ?? 0)) : 0;
  if (maxW >= 22 || maxG >= 32 || maxS >= 2.5) return { level: "no", text: `Not safe for small boats: ${maxW >= 22 || maxG >= 32 ? `wind to ${Math.round(maxW)} kn, gusts ${Math.round(maxG)} kn` : ""}${maxS >= 2.5 ? ` swell to ${maxS} m` : ""}. Stay on shore or sheltered water.` };
  if (maxW >= 15 || maxG >= 25 || maxS >= 1.5) return { level: "caution", text: `Take care: wind up to ${Math.round(maxW)} kn${coastal ? `, swell up to ${maxS} m` : ""}. Fine early, check before you launch.` };
  return { level: "ok", text: `Looks safe: wind under ${Math.ceil(maxW)} kn${coastal ? `, swell under ${Math.ceil(maxS * 10) / 10} m` : ""} all day.` };
}
