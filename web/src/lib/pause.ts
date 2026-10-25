// "Pause for winter" (Alex, 26 Oct 2026). Pure helpers shared by the account page, the API routes,
// the Stripe webhook, the alerts job and check-pause.
//
// - Paid (Stripe) subscribers pick 1 to 6 months. Stripe: subscriptions.update with
//   pause_collection { behavior: "void", resumes_at }. No invoices while paused; Stripe lifts the
//   pause by itself at resumes_at. "Resume now" clears pause_collection.
// - paused_until (profiles + subscriptions, written by the webhook) mirrors resumes_at.
//   "infinity" = paused with no end date (e.g. set by hand in the Stripe dashboard).
// - While paused: no alerts, and the user gets the free tier (effectivePlan).
export const PAUSE_MONTHS = [1, 2, 3, 4, 5, 6] as const;
export type PauseMonths = (typeof PAUSE_MONTHS)[number];
export const isPauseMonths = (n: unknown): n is PauseMonths => PAUSE_MONTHS.includes(n as PauseMonths);
export const NO_END = "infinity";

const TZ = "Pacific/Auckland";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");
/** NZ calendar date (YYYY-MM-DD) at an instant. */
export const nzDate = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(t));
const nzOffsetMin = (t: number) => {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(new Date(t)).find((p) => p.type === "timeZoneName")!.value; // "GMT+13:00"
  const m = /GMT([+-])(\d\d):(\d\d)/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
};

/** The NZ date the pause ends: the same day of the month, n months on (clamped to the month's last day). */
export function pauseEndDate(months: PauseMonths, now = Date.now()): string {
  const [y, m, d] = nzDate(now).split("-").map(Number);
  const t = m - 1 + months, yy = y + Math.floor(t / 12), mm = t % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${yy}-${pad(mm + 1)}-${pad(Math.min(d, last))}`;
}
/** Unix seconds for 00:00 NZ time on a NZ date (Stripe's resumes_at). */
export function nzMidnight(date: string): number {
  const noonUtc = Date.parse(`${date}T00:00:00Z`); // NZ is 12 or 13 hours ahead, so this instant is the same NZ day
  return (noonUtc - nzOffsetMin(noonUtc) * 60e3) / 1000;
}
export const resumesAtFor = (months: PauseMonths, now = Date.now()) => nzMidnight(pauseEndDate(months, now));

/** Paused right now? A pause whose date has passed counts as over even before the webhook lands. */
export const isPaused = (pausedUntil: string | null | undefined, now = Date.now()) =>
  !!pausedUntil && (pausedUntil === NO_END || Date.parse(pausedUntil) > now);

/** "Tue 26 Jan 2027" in NZ time. */
export function pauseLabel(pausedUntil: string): string {
  if (pausedUntil === NO_END) return "you resume it";
  const [y, m, d] = nzDate(Date.parse(pausedUntil)).split("-").map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
}

export type PaidPlan = "trial" | "pro" | "pro_annual";
export type AnyPlan = "free" | PaidPlan;
/** What the user can use: the free tier while paused. */
export const effectivePlan = <P extends AnyPlan>(plan: P, pausedUntil: string | null | undefined, now = Date.now()): P | "free" =>
  isPaused(pausedUntil, now) ? "free" : plan;
