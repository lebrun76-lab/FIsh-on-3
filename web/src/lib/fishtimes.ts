// "When can you fish?" Stored on the user's profile (profiles.fishing_times). Alerts only go out
// for a window that sits fully inside one of the chosen times. Pure, so client and server share it.
export type FishTime = "weekday_morning" | "weekday_evening" | "saturday" | "sunday" | "any";
export const FISH_TIMES: { id: FishTime; label: string; rule: string }[] = [
  { id: "weekday_morning", label: "Weekdays before work", rule: "Mon to Fri, window ends by 9am" },
  { id: "weekday_evening", label: "Weekday evenings (after 4pm)", rule: "Mon to Fri, window starts 4pm or later" },
  { id: "saturday", label: "Saturday", rule: "Any time Saturday" },
  { id: "sunday", label: "Sunday", rule: "Any time Sunday" },
  { id: "any", label: "Any time", rule: "Every window" },
];
/** Weekends plus any time from 4pm. Same default as the migration. */
export const DEFAULT_FISH_TIMES: FishTime[] = ["weekday_evening", "saturday", "sunday"];
export const BEFORE_WORK_END = 9 * 60, EVENING_START = 16 * 60;

const ids = new Set(FISH_TIMES.map((x) => x.id));
/** Clean a stored value: known ids only, "any" on its own, never empty (falls back to the default). */
export function normaliseTimes(v: unknown): FishTime[] {
  const t = Array.isArray(v) ? (v.filter((x) => ids.has(x)) as FishTime[]) : [];
  if (t.includes("any")) return ["any"];
  return t.length ? FISH_TIMES.map((x) => x.id).filter((id) => t.includes(id)) : DEFAULT_FISH_TIMES;
}
/** Chip toggle: "any" replaces the rest, picking another clears "any", the last chip can't be cleared. */
export function toggleTime(cur: FishTime[], id: FishTime): FishTime[] {
  if (id === "any") return ["any"];
  const base = cur.filter((x) => x !== "any");
  const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
  return next.length ? normaliseTimes(next) : cur;
}

// Engine times are NZ wall time with an offset ("2026-10-28T05:00:00+13:00"); read the wall clock directly.
const wall = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return { dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), date: iso.slice(0, 10), min: +iso.slice(11, 13) * 60 + +iso.slice(14, 16) }; };

/** Does the window [start, end) sit inside one of the chosen times? */
export function fitsTimes(start: string, end: string, times: FishTime[]): boolean {
  const t = normaliseTimes(times);
  if (t.includes("any")) return true;
  const a = wall(start), b = wall(end);
  const endMin = b.date === a.date ? b.min : b.min + 24 * 60; // a window ending at midnight ends at 24:00
  const weekday = a.dow >= 1 && a.dow <= 5;
  return (t.includes("weekday_morning") && weekday && endMin <= BEFORE_WORK_END)
    || (t.includes("weekday_evening") && weekday && a.min >= EVENING_START)
    || (t.includes("saturday") && a.dow === 6 && endMin <= 24 * 60)
    || (t.includes("sunday") && a.dow === 0 && endMin <= 24 * 60);
}
