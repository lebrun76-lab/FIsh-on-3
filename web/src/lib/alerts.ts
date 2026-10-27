// Which alerts go out to one user on one run. Pure, so the job and check-calls share it.
//
// Rules (Alex, 26 Oct 2026):
// - A candidate is the alertCall pick for each saved spot: engine window >= 4.5 (FISHABLE, the only bar;
//   the old good/great setting is gone), 1 to 2 days ahead, inside the user's fishing times.
// - Never the same window twice: windows already in alerts_sent (spot_id + window_start) are skipped,
//   so a spot can offer its next-best window instead.
// - At most ALERT_CAP alerts per user per rolling ALERT_CAP_DAYS days (counted on sent_at). When more
//   qualify than the cap leaves room for, the highest scores win, ties to the earliest window.
import { alertCall, FISHABLE, type Call } from "./call";
import type { FishTime } from "./fishtimes";
import { isPaused, type AnyPlan } from "./pause";
import type { SpotForecast } from "./types";

export const ALERT_CAP = 2, ALERT_CAP_DAYS = 7;
/** A row of public.alerts_sent. */
export interface SentAlert { spot_id: string; window_start: string; window_end: string; score: number; sent_at: string; window_id?: string | null; target_species?: string[] | null; channel?: "email" | "push"; }
/** The engine's window id (2.4+), stored as it was in the alert. Older output: built the same way (spot:start/end). */
export const windowIdOf = (spotId: string, c: Pick<Call, "start" | "end" | "window">) => c.window?.id ?? `${spotId}:${c.start}/${c.end}`;
export interface AlertPlan { spot_id: string; call: Call; }

const key = (spot: string, start: string) => `${spot}@${Date.parse(start)}`;
/** Alerts sent in the rolling window ending now. */
export const sentInCap = (sent: SentAlert[], now = Date.now()) => sent.filter((s) => { const t = Date.parse(s.sent_at); return t > now - ALERT_CAP_DAYS * 864e5 && t <= now; });

/** Best first: highest score, ties to the earliest window. */
export const byBest = (a: { score: number; start: string | null }, b: { score: number; start: string | null }) => b.score - a.score || Date.parse(a.start!) - Date.parse(b.start!);

/** One rule for both channels. Email and push share the candidate (alertCall: saved spots, engine
 *  windows 1 to 2 days ahead, inside fishing times, never the same window twice); they differ only in
 *  the bar, the cap and quiet hours.
 *  - email: windows >= 4.5, at most 2 a rolling week.
 *  - push:  windows >= 6 (good or better), at most one per spot per NZ day, nothing 9pm to 7am NZ. */
export interface AlertRule { channel: "email" | "push"; min: number; cap: { n: number; days: number } | null; perSpotPerDay: boolean; quiet: { from: number; to: number } | null; }
export const EMAIL_RULE: AlertRule = { channel: "email", min: FISHABLE, cap: { n: ALERT_CAP, days: ALERT_CAP_DAYS }, perSpotPerDay: false, quiet: null };
export const PUSH_RULE: AlertRule = { channel: "push", min: 6, cap: null, perSpotPerDay: true, quiet: { from: 21, to: 7 } };

const nzParts = (t: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
};
/** NZ calendar date of a timestamp. */
export const nzDate = (t: number) => nzParts(t).date;
/** True overnight in NZ (quiet.from to quiet.to, wrapping midnight). */
export const inQuiet = (q: AlertRule["quiet"], now = Date.now()) => { if (!q) return false; const h = nzParts(now).hour; return q.from > q.to ? h >= q.from || h < q.to : h >= q.from && h < q.to; };

export function planAlerts(forecasts: SpotForecast[], times: FishTime[], sent: SentAlert[], now = Date.now(), rule: AlertRule = EMAIL_RULE): AlertPlan[] {
  if (inQuiet(rule.quiet, now)) return [];
  const mine = sent.filter((s) => (s.channel ?? "email") === rule.channel);
  const room = rule.cap ? Math.max(0, rule.cap.n - mine.filter((s) => { const t = Date.parse(s.sent_at); return t > now - rule.cap!.days * 864e5 && t <= now; }).length) : Infinity;
  if (!room) return [];
  const done = new Set(mine.map((s) => key(s.spot_id, s.window_start)));
  const today = nzDate(now), doneToday = new Set(rule.perSpotPerDay ? mine.filter((s) => nzDate(Date.parse(s.sent_at)) === today).map((s) => s.spot_id) : []);
  return forecasts
    .filter((f) => !doneToday.has(f.spot.id))
    .map((f) => ({ spot_id: f.spot.id, call: alertCall(f, times, now, (w) => w.score >= rule.min && !done.has(key(f.spot.id, w.start))) }))
    .filter((p) => p.call.kind === "window")
    .sort((a, b) => byBest(a.call, b.call))
    .slice(0, room);
}

/** The rows to insert into alerts_sent once the emails are out. */
export const sentRows = (plan: AlertPlan[], now = Date.now(), channel: "email" | "push" = "email"): SentAlert[] =>
  plan.map((p) => ({ channel, spot_id: p.spot_id, window_start: p.call.start!, window_end: p.call.end!, score: p.call.score, sent_at: new Date(now).toISOString(), window_id: windowIdOf(p.spot_id, p.call), target_species: p.call.window?.target_species ?? null }));

/** The user fields the job needs. paused_until = profiles.paused_until (Pause for winter). */
export interface AlertAccount { plan: AnyPlan; paused_until: string | null; alerts_enabled: boolean; fishing_times: FishTime[]; }
/** Paid, alerts on, not paused. Paused users get no alerts at all until the pause ends. */
export const alertsAllowed = (a: AlertAccount, now = Date.now()) => a.plan !== "free" && a.alerts_enabled && !isPaused(a.paused_until, now);
/** Alerts for one user on one run: nothing while paused, otherwise planAlerts. */
export const planUserAlerts = (a: AlertAccount, forecasts: SpotForecast[], sent: SentAlert[], now = Date.now()): AlertPlan[] =>
  alertsAllowed(a, now) ? planAlerts(forecasts, a.fishing_times, sent, now) : [];

/** Push settings (public.push_settings): one switch, plus saved spots switched off. */
export interface PushSettings { enabled: boolean; spots_off: string[]; }
/** Push for one user on one run: paid, not paused, push on; saved spots not switched off; PUSH_RULE.
 *  Independent of the email switch. `forecasts` are the user's saved spots. */
export function planUserPush(a: AlertAccount, push: PushSettings, forecasts: SpotForecast[], sent: SentAlert[], now = Date.now()): AlertPlan[] {
  if (a.plan === "free" || !push.enabled || isPaused(a.paused_until, now)) return [];
  const off = new Set(push.spots_off);
  return planAlerts(forecasts.filter((f) => !off.has(f.spot.id)), a.fishing_times, sent, now, PUSH_RULE);
}
