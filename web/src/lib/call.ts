/**
 * One place that decides "the call" for a spot, so a badge and the sentence
 * next to it always describe the SAME window.
 *
 * - scope "horizon": the engine's 3-day horizon in NZ calendar days (today .. today+2),
 *   the same rule the engine uses for verdict.horizon_end.
 * - scope "day": the next day with fishable daylight (free tier, "today").
 *
 * Order: the engine's verdict window if it hasn't ended yet -> best remaining engine
 * window (score >= 4.5) in scope -> otherwise no fishable window. The badge score is the
 * chosen window's score, never a day score.
 *
 * Since feat/windows-and-copy the engine lists EVERY separate window scoring >= 4.5
 * (up to 4 a day), so once they have all passed there is nothing fishable left. Older
 * output only listed windows within 1.5 of the day's best (max 3), so for that shape
 * only we still look for the best remaining 3-5 h daylight run in the hourly scores
 * (same rule as the engine's scoring.windows).
 *
 * `also` = the other windows on the pick's day that are near the day's best
 * (engine `near_best`, or within 1.5 of the day's best on older output): "also worth a look".
 */
import type { DaySummary, FishingWindow, Rating, SpotForecast } from "./types";
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
  also: FishingWindow[];              // other live near-best windows on the same day, time order
  when: string;                       // "today 6–9pm", "Wed 5–8am"
  headline: string;                   // "Go Wed 5–8am", "Best chance today 6–9pm", "No fishable window in the next 3 days"
  dates: string[];
}

/** True when the output lists every window >= 4.5 (feat/windows-and-copy). Older output didn't. */
export const listsAllWindows = (f: SpotForecast) => f.days.some((d) => d.score_remaining !== undefined) || f.windows.some((w) => w.near_best !== undefined);

/** near_best from the engine, or worked out the same way (within 1.5 of the day's best) on older output. */
export function isNearBest(f: SpotForecast, w: FishingWindow): boolean {
  if (typeof w.near_best === "boolean") return w.near_best;
  const date = w.start.slice(0, 10);
  const best = Math.max(f.days.find((d) => d.date === date)?.best_window?.score ?? -Infinity, ...f.windows.filter((x) => x.start.slice(0, 10) === date).map((x) => x.score));
  return w.score >= Math.round((best - 1.5) * 10) / 10;
}

/** Day score to show: today uses score_remaining (daylight still to come), falling back to score; other days use score. */
export const dayScore = (d: DaySummary, today = nzTodayISO()) => (d.date === today && d.score_remaining != null ? d.score_remaining : d.score);

/** Is today's part of the output out of date? Engine 2.3+ says so directly with valid_until
 *  (end of the hour it was made in). Older output: the clock's hour is past remaining_from.
 *  `from` is the hour today's score counts from; `until` is when it stopped being current. */
export function todayStale(f: SpotForecast, now = Date.now()): { stale: boolean; from: string | null; until: string | null } {
  const d = f.days.find((x) => x.date === nzTodayISO());
  const from = d?.remaining_from ?? null;
  if (f.valid_until && !Number.isNaN(Date.parse(f.valid_until))) return { stale: now >= Date.parse(f.valid_until), from, until: f.valid_until };
  if (!from) return { stale: false, from: null, until: null };
  return { stale: Math.floor(now / 36e5) * 36e5 > Date.parse(from), from, until: nextHourWall(from) };
}

/** "2026-10-26T08:00:00+13:00" -> "2026-10-26T09:00:00+13:00", keeping NZ wall time and offset (for clock()). */
function nextHourWall(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(.*)$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 1));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}${m[5]}`;
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

/** "today 6–9pm", "Wed 5–8am". */
export function whenText(s: string, e: string, today = nzTodayISO(), withDay = true) {
  const a = clock(s), b = clock(e), sfx = (x: string) => x.slice(-2);
  const t = `${sfx(a) === sfx(b) ? a.slice(0, -2) : a}–${b}`;
  return withDay ? `${s.slice(0, 10) === today ? "today" : dayShort(s)} ${t}` : t;
}

/** `only` narrows the same rule to some dates and windows (alerts): engine windows only, no hourly fallback. */
export function bestCall(f: SpotForecast, scope: Scope, now = Date.now(), only?: { dates: string[]; keep?: (w: FishingWindow) => boolean }): Call {
  const dates = only ? only.dates : scopeDates(f, scope), set = new Set(dates), today = nzTodayISO(), hz = f.verdict.horizon_days ?? 3;
  const whenOf = (s: string, e: string) => whenText(s, e, today);
  const live = f.windows.filter((w) => Date.parse(w.end) > now && set.has(w.start.slice(0, 10)) && w.score >= FISHABLE && (!only?.keep || only.keep(w)));
  const pick = (scope === "horizon" && live.find((w) => w.start === f.verdict.window?.start))
    || live.slice().sort((a, b) => b.score - a.score || a.start.localeCompare(b.start))[0];
  const also = pick ? live.filter((w) => w !== pick && w.start.slice(0, 10) === pick.start.slice(0, 10) && isNearBest(f, w)).sort((a, b) => a.start.localeCompare(b.start)) : [];
  const mk = (kind: Call["kind"], source: Call["source"], score: number, rating: Rating, start: string | null, end: string | null, window: FishingWindow | null): Call => {
    const when = start && end ? whenOf(start, end) : "";
    const span = scope === "horizon" ? `in the next ${hz} days` : dates[0] === today ? "today" : `on ${dayShort(dates[0])}`;
    const headline = kind === "none" ? `No fishable window ${span}` : `${rating === "marginal" ? "Best chance" : "Go"} ${when}`;
    return { kind, source, rating, score, start, end, date: start?.slice(0, 10) ?? dates[0], window, also: window ? also : [], when, headline: headline[0].toUpperCase() + headline.slice(1), dates };
  };
  if (pick) return mk("window", "engine", pick.score, pick.rating, pick.start, pick.end, pick);
  if (only) return mk("none", null, 0, "poor", null, null, null);
  if (listsAllWindows(f)) return mk("none", null, 0, "poor", null, null, null); // every window >= 4.5 was listed and they've all passed
  const run = hourlyRun(f, set, now); // older output only
  if (run && run.score >= FISHABLE) return mk("window", "hourly", run.score, ratingFor(run.score), run.start, run.end, null);
  return mk("none", null, run?.score ?? 0, "poor", null, null, null);
}

/** Alerts go out 1 to 2 days ahead: the pick among engine windows (score >= 4.5) dated tomorrow or the
 *  day after, by the same rule as bestCall. Today's windows are on the site, not in an email. */
export const ALERT_LEAD_DAYS = [1, 2];
export function alertCall(f: SpotForecast, now = Date.now()): Call {
  const today = nzTodayISO();
  return bestCall(f, "horizon", now, { dates: ALERT_LEAD_DAYS.map((n) => addDays(today, n)) });
}

/** "Snapper, kingfish" for a sentence, from engine names like "Blue Cod". */
export const targetList = (names: string[]) => names.map((n, i) => (i ? n.toLowerCase() : n[0] + n.slice(1).toLowerCase())).join(", ");
