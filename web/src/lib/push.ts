// Push alert text. Pure, so the job, the tests and the settings preview agree.
import type { Call } from "./call";
import { clock, dayShort } from "./time";

/** "6 to 10am", "11am to 2pm". */
export function spanText(start: string, end: string) {
  const a = clock(start), b = clock(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -2)} to ${b}` : `${a} to ${b}`;
}
const shortName = (n: string) => n.split(" (")[0].split(" / ")[0];

export interface PushMessage { title: string; body: string; url: string; tag: string; }
/** "Hauraki Gulf: good fishing Sat 6 to 10am." with the window's wind and sea underneath. */
export function pushMessage(spot: { id: string; name: string }, c: Pick<Call, "start" | "end" | "score" | "window">): PushMessage {
  const word = c.score >= 7.5 ? "great" : "good", w = c.window;
  const sea = w?.wave_m ?? w?.swell_m;
  const body = [w?.wind_kn != null ? `Wind ${Math.round(w.wind_kn)} kn${w.wind_from ? ` ${w.wind_from}` : ""}` : null, sea != null ? `sea ${Math.round(sea * 10) / 10} m` : null].filter(Boolean).join(", ");
  return { title: `${shortName(spot.name)}: ${word} fishing ${dayShort(c.start!)} ${spanText(c.start!, c.end!)}.`, body: body ? `${body}.` : "", url: `/spots/${spot.id}`, tag: `${spot.id}:${c.start}` };
}
