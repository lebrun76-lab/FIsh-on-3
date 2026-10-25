/**
 * One place that decides "the call" for a spot, so a badge and the sentence
 * next to it always describe the SAME window.
 *
 * - scope "horizon": the engine's 3-day horizon in NZ calendar days (today .. today+2),
 *   the same rule the engine uses for verdict.horizon_end.
 * - scope "day": the next day with fishable daylight (free tier, "today").
 *
 * Order: the engine's verdict window if it hasn't ended yet -> best remaining engine
 * window (score >= 4.5) in scope -> if the engine's windows for the day have all passed,
 * the best remaining 3-5 h daylight run from the hourly scores (same rule as the engine's
 * scoring.windows) -> otherwise no fishable window. The badge score is the chosen
 * window's score. It is never the whole-day score, which still counts hours that have passed.
 */
import type { FishingWindow, Rating, SpotForecast } from "./types";
import { clock, dayShort, nzTodayISO } from "./time";

export const FISHABLE = 4.5;
export const ratingFor = (s: number): Rating => (s >= 7.5 ? "great" : s >= 6 ? "good" : s >= FISHABLE ? "marginal" : "poor");
const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

export type Scope = "horizon" | "day";
export interface Call {
  kind: "window" | "none";
  source: "engine" | "hourly" | null; // hourly = derived after the engine's own windows passed
  rating: Rating;
  score: number;
  start: string | null;
  end: string | null;
  date: string;                       // the window's date, or the first date in scope
  window: FishingWindow | null;       // the engine window, when source = engine
  when: string;                       // "today 6–9pm", "Wed 5–8am"
  headline: string;                   // "Go Wed 5–8am", "Best chance today 6–9pm", "No fishable window in the next 3 days"
  dates: string[];
}

export const nextDayIndex = (f: SpotForecast) => Math.max(0, f.days.findIndex((d) => d.score !== null));

export function scopeDates(f: SpotForecast, scope: Scope): string[] {
  if (scope === "day") return [f.days[nextDayIndex(f)]?.date].filter(Boolean) as string[];
  const today = nzTodayISO();
  const last = addDays(today, (f.verdict.horizon_days ?? 3) - 1);
  const ds = f.days.map((d) => d.date).filter((d) => d >= today && d <= last);
  return ds.length ? ds : [f.days[0].date];
}

function hourlyRun(f: SpotForecast, dates: Set<string>, now: number) {
  const sun = new Map(f.days.map((d) => [d.date, d]));
  const hs = f.hourly.filter((h) => {
    const date = h.time.slice(0, 10), d = sun.get(date), t = Date.parse(h.time);
    if (!dates.has(date) || h.score === null || t < now - 30 * 60e3) return false;
    const rise = d?.sunrise ? Date.parse(d.sunrise) - 36e5 : Date.parse(`${date}T06:00:00${h.time.slice(19)}`);
    const set = d?.sunset ? Date.parse(d.sunset) + 36e5 : Date.parse(`${date}T20:00:00${h.time.slice(19)}`);
    return t >= rise - 30 * 60e3 && t <= set;
  });
  let best: { start: string; end: string; score: number; v: number } | null = null;
  for (let L = 3; L <= 5; L++) for (let i = 0; i + L <= hs.length; i++) {
    const w = hs.slice(i, i + L);
    if (Date.parse(w[L - 1].time) - Date.parse(w[0].time) !== (L - 1) * 36e5) continue;
    const mean = w.reduce((a, h) => a + (h.score as number), 0) / L, v = mean + 0.05 * L;
    if (!best || v > best.v) best = { start: w[0].time, end: new Date(Date.parse(w[L - 1].time) + 36e5).toISOString(), score: Math.round(mean * 10) / 10, v };
  }
  if (best) { const off = hs[0].time.slice(19); best.end = toLocal(best.end, off); }
  return best;
}
function toLocal(utcIso: string, off: string) { // "+13:00"
  const sign = off.startsWith("-") ? -1 : 1, [oh, om] = off.slice(1).split(":").map(Number);
  const t = new Date(Date.parse(utcIso) + sign * (oh * 60 + om) * 60e3).toISOString().slice(0, 19);
  return t + off;
}

export function bestCall(f: SpotForecast, scope: Scope, now = Date.now()): Call {
  const dates = scopeDates(f, scope), set = new Set(dates), today = nzTodayISO(), hz = f.verdict.horizon_days ?? 3;
  const whenOf = (s: string, e: string) => {
    const a = clock(s), b = clock(e), sfx = (x: string) => x.slice(-2);
    return `${s.slice(0, 10) === today ? "today" : dayShort(s)} ${sfx(a) === sfx(b) ? a.slice(0, -2) : a}–${b}`;
  };
  const live = f.windows.filter((w) => Date.parse(w.end) > now && set.has(w.start.slice(0, 10)) && w.score >= FISHABLE);
  const pick = (scope === "horizon" && live.find((w) => w.start === f.verdict.window?.start))
    || live.slice().sort((a, b) => b.score - a.score || a.start.localeCompare(b.start))[0];
  const mk = (kind: Call["kind"], source: Call["source"], score: number, rating: Rating, start: string | null, end: string | null, window: FishingWindow | null): Call => {
    const when = start && end ? whenOf(start, end) : "";
    const span = scope === "horizon" ? `in the next ${hz} days` : dates[0] === today ? "today" : `on ${dayShort(dates[0])}`;
    const headline = kind === "none" ? `No fishable window ${span}` : `${rating === "marginal" ? "Best chance" : "Go"} ${when}`;
    return { kind, source, rating, score, start, end, date: start?.slice(0, 10) ?? dates[0], window, when, headline: headline[0].toUpperCase() + headline.slice(1), dates };
  };
  if (pick) return mk("window", "engine", pick.score, pick.rating, pick.start, pick.end, pick);
  const run = hourlyRun(f, set, now);
  if (run && run.score >= FISHABLE) return mk("window", "hourly", run.score, ratingFor(run.score), run.start, run.end, null);
  return mk("none", null, run?.score ?? 0, "poor", null, null, null);
}

/** "Snapper, kingfish" for a sentence, from engine names like "Blue Cod". */
export const targetList = (names: string[]) => names.map((n, i) => (i ? n.toLowerCase() : n[0] + n.slice(1).toLowerCase())).join(", ");
