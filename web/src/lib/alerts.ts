// Which alerts go out to one user on one run. Pure, so the job and check-calls share it.
//
// Rules (Alex, 26 Oct 2026):
// - A candidate is the alertCall pick for each saved spot: engine window >= 4.5 (FISHABLE, the only bar;
//   the old good/great setting is gone), 1 to 2 days ahead, inside the user's fishing times.
// - Never the same window twice: windows already in alerts_sent (spot_id + window_start) are skipped,
//   so a spot can offer its next-best window instead.
// - At most ALERT_CAP alerts per user per rolling ALERT_CAP_DAYS days (counted on sent_at). When more
//   qualify than the cap leaves room for, the highest scores win, ties to the earliest window.
import { alertCall, type Call } from "./call";
import type { FishTime } from "./fishtimes";
import type { SpotForecast } from "./types";

export const ALERT_CAP = 2, ALERT_CAP_DAYS = 7;
/** A row of public.alerts_sent. */
export interface SentAlert { spot_id: string; window_start: string; window_end: string; score: number; sent_at: string; }
export interface AlertPlan { spot_id: string; call: Call; }

const key = (spot: string, start: string) => `${spot}@${Date.parse(start)}`;
/** Alerts sent in the rolling window ending now. */
export const sentInCap = (sent: SentAlert[], now = Date.now()) => sent.filter((s) => { const t = Date.parse(s.sent_at); return t > now - ALERT_CAP_DAYS * 864e5 && t <= now; });

/** Best first: highest score, ties to the earliest window. */
export const byBest = (a: { score: number; start: string | null }, b: { score: number; start: string | null }) => b.score - a.score || Date.parse(a.start!) - Date.parse(b.start!);

export function planAlerts(forecasts: SpotForecast[], times: FishTime[], sent: SentAlert[], now = Date.now()): AlertPlan[] {
  const room = Math.max(0, ALERT_CAP - sentInCap(sent, now).length);
  if (!room) return [];
  const done = new Set(sent.map((s) => key(s.spot_id, s.window_start)));
  return forecasts
    .map((f) => ({ spot_id: f.spot.id, call: alertCall(f, times, now, (w) => !done.has(key(f.spot.id, w.start))) }))
    .filter((p) => p.call.kind === "window")
    .sort((a, b) => byBest(a.call, b.call))
    .slice(0, room);
}

/** The rows to insert into alerts_sent once the emails are out. */
export const sentRows = (plan: AlertPlan[], now = Date.now()): SentAlert[] =>
  plan.map((p) => ({ spot_id: p.spot_id, window_start: p.call.start!, window_end: p.call.end!, score: p.call.score, sent_at: new Date(now).toISOString() }));
