// Reminder 7 days before a winter pause ends (Alex, 26 Oct 2026). Pure planning + a small job runner.
//
// Rules:
// - Due when the NZ restart date (the NZ date of paused_until) is 7 days away or less. Normally that's
//   exactly 7 days out; if the job first sees a pause with under 7 days left (short pause, missed run),
//   it sends once as soon as it can.
// - Once per pause: keyed on stripe_sub_id + paused_until (pause_reminders_sent). Pausing again with a
//   new date is a new pause and gets its own reminder.
// - Never for a pause with no end date ("infinity"), a pause that has ended, a resumed or cancelled sub.
import { pauseReminderEmail, type EmailTemplate } from "./emails";
import { NO_END, isPaused, nzDate } from "./pause";
import { sendEmail } from "./mailer";

export const REMINDER_DAYS = 7;
/** The subscriptions row fields the job reads (paused_until is written by the Stripe webhook). */
export interface PausedSub { user_id: string; email: string; stripe_sub_id: string; status: string; paused_until: string | null; }
/** A row of public.pause_reminders_sent. */
export interface ReminderSent { stripe_sub_id: string; paused_until: string; user_id: string; sent_at: string; email_id: string; }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayNum = (date: string) => { const [y, m, d] = date.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
/** NZ restart date of a pause, "YYYY-MM-DD". */
export const restartDate = (pausedUntil: string) => nzDate(Date.parse(pausedUntil));
/** "Fri 26 Feb" */
export const restartLabel = (pausedUntil: string) => { const d = restartDate(pausedUntil), [, m, day] = d.split("-").map(Number); return `${DAYS[new Date(dayNum(d) * 864e5).getUTCDay()]} ${day} ${MONTHS[m - 1]}`; };
/** Whole NZ calendar days from now until the restart date. */
export const daysToRestart = (pausedUntil: string, now = Date.now()) => dayNum(restartDate(pausedUntil)) - dayNum(nzDate(now));
const key = (sub: string, until: string) => `${sub}@${Date.parse(until)}`;

export function dueReminders(subs: PausedSub[], sent: ReminderSent[], now = Date.now()): PausedSub[] {
  const done = new Set(sent.map((s) => key(s.stripe_sub_id, s.paused_until)));
  return subs.filter((s) =>
    s.paused_until && s.paused_until !== NO_END && s.status !== "canceled" &&
    isPaused(s.paused_until, now) && daysToRestart(s.paused_until, now) <= REMINDER_DAYS &&
    !done.has(key(s.stripe_sub_id, s.paused_until)));
}

export const reminderFor = (s: PausedSub): EmailTemplate => pauseReminderEmail(restartLabel(s.paused_until!));

/** One job run: send what's due, return the rows to insert into pause_reminders_sent. */
export async function runPauseReminders(subs: PausedSub[], sent: ReminderSent[], now = Date.now(), send = sendEmail): Promise<ReminderSent[]> {
  const rows: ReminderSent[] = [];
  for (const s of dueReminders(subs, sent, now)) {
    const m = await send(reminderFor(s), s.email, `pause-reminder/${key(s.stripe_sub_id, s.paused_until!)}`);
    rows.push({ stripe_sub_id: s.stripe_sub_id, paused_until: s.paused_until!, user_id: s.user_id, sent_at: new Date(now).toISOString(), email_id: m.id });
  }
  return rows;
}
