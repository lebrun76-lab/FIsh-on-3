// "How'd it go?" follow-up (Alex, 26 Oct 2026). Server side only (node:crypto).
//
// - One email per alert actually sent (alerts_sent), about 8am NZ the day after the window started,
//   and only once the window has ended. A missed run catches up later that NZ day; after that it's
//   stale and skipped. Never for paused or unsubscribed users.
// - Three answers: caught | nothing | didnt_go. "Caught" can add species from that spot's list.
// - Links carry a signed token (HMAC-SHA256, one per alert, expires TOKEN_DAYS after the email). The
//   GET page only shows a confirm button; nothing is recorded until the POST. Email scanners open links.
// - One answer per alert (catch_feedback.alert_id unique). It can be changed for CHANGE_DAYS after the
//   first answer, while the link is still valid.
// - didnt_go is stored and exported like the others, but it isn't a verdict on the forecast, so it is
//   left out of every hit rate.
// - Forecast Brain export: spot, window id and times, score, target species, outcome, species. No user ids, no alert ids, no coordinates.
import crypto from "node:crypto";
import { BRAND } from "./brand";
import { howdItGoEmail, type EmailTemplate } from "./emails";
import { sendEmail } from "./mailer";
import { serviceHeaders, serviceRole } from "./supabase/config";
import { getSpot } from "./mock";
import { isPaused, nzDate } from "./pause";
import type { SentAlert } from "./alerts";

export const OUTCOMES = ["caught", "nothing", "didnt_go"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const isOutcome = (x: unknown): x is Outcome => OUTCOMES.includes(x as Outcome);
export const OUTCOME_LABEL: Record<Outcome, string> = { caught: "Caught something", nothing: "Nothing doing", didnt_go: "Didn't go" };
export const TOKEN_DAYS = 14, CHANGE_DAYS = 7, SEND_HOUR_NZ = 8, MAX_SPECIES = 6;
const DAY = 864e5;

/** A row of public.alerts_sent, with its id and the follow-up columns. */
export interface AlertRow extends SentAlert { id: string; user_id: string; followup_sent_at?: string | null; }
/** A row of public.catch_feedback. */
export interface FeedbackRow { alert_id: string; user_id: string; spot_id: string; window_id: string; window_start: string; window_end: string; score: number; target_species: string[] | null; outcome: Outcome; species: string[]; created_at: string; updated_at: string; }
/** What the job needs per user: profiles.paused_until and profiles.emails_unsubscribed_at. */
export interface FollowupAccount { email: string; paused_until: string | null; unsubscribed: boolean; }

// ------------------------------------------------------------------ tokens
export function feedbackSecret(): string {
  const s = process.env.FEEDBACK_SECRET;
  if (s) return s;
  if (process.env.RESEND_API_KEY || serviceRole()) throw new Error("FEEDBACK_SECRET must be set outside mock mode");
  return "fbk_mock_prototype";
}
const sign = (alertId: string, exp: number, secret: string) => crypto.createHmac("sha256", secret).update(`howd-it-go.v1.${alertId}.${exp}`, "utf8").digest("base64url");
/** "<alertId>.<exp unix s>.<sig>". exp = TOKEN_DAYS after the email went out. */
export function makeToken(alertId: string, sentAt: number, secret = feedbackSecret()): string {
  const exp = Math.floor(sentAt / 1000) + TOKEN_DAYS * 86400;
  return `${alertId}.${exp}.${sign(alertId, exp, secret)}`;
}
export type TokenCheck = { ok: true; alertId: string; exp: number } | { ok: false; reason: "bad" | "expired" };
export function verifyToken(token: string, now = Date.now(), secret = feedbackSecret()): TokenCheck {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3 || !/^[\w-]{1,64}$/.test(parts[0]) || !/^\d{1,12}$/.test(parts[1])) return { ok: false, reason: "bad" };
  const [alertId, e, sig] = parts, exp = Number(e);
  const want = Buffer.from(sign(alertId, exp, secret)), got = Buffer.from(sig);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return { ok: false, reason: "bad" };
  if (now >= exp * 1000) return { ok: false, reason: "expired" };
  return { ok: true, alertId, exp };
}
export const answerUrl = (token: string, o: Outcome) => `${BRAND.url}/howd-it-go/${token}?o=${o}`;

// ------------------------------------------------------------------ when to send
const offsetMin = (t: number) => {
  const n = new Intl.DateTimeFormat("en-US", { timeZone: "Pacific/Auckland", timeZoneName: "longOffset" }).formatToParts(new Date(t)).find((p) => p.type === "timeZoneName")!.value;
  const m = /GMT([+-])(\d\d):(\d\d)/.exec(n);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
};
/** The instant of hh:00 NZ wall time on a NZ date (DST-safe). */
export function nzAt(date: string, hh: number): number {
  const wall = Date.parse(`${date}T${String(hh).padStart(2, "0")}:00:00Z`);
  const t = wall - offsetMin(wall - 12 * 36e5) * 6e4;
  return wall - offsetMin(t) * 6e4;
}
const nextDate = (date: string, n = 1) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
/** NZ date the follow-up goes out: the day after the window started. */
export const followupDate = (a: Pick<AlertRow, "window_start">) => nextDate(nzDate(Date.parse(a.window_start)));
/** From 8am NZ that day (or the window end, if later) until the end of that NZ day. */
export function followupDue(a: AlertRow, now = Date.now()): boolean {
  const d = followupDate(a), from = Math.max(nzAt(d, SEND_HOUR_NZ), Date.parse(a.window_end));
  return now >= from && nzDate(now) <= d;
}
export function dueFollowups(alerts: AlertRow[], accounts: Record<string, FollowupAccount>, now = Date.now()): AlertRow[] {
  const seen = new Set<string>();
  return alerts.filter((a) => {
    const acc = accounts[a.user_id];
    if ((a.channel ?? "email") !== "email") return false; // follow-ups hang off email alerts only, not phone alerts
    if (!acc || acc.unsubscribed || isPaused(acc.paused_until, now) || a.followup_sent_at || seen.has(a.id) || !followupDue(a, now)) return false;
    seen.add(a.id);
    return true;
  });
}
const spotName = (id: string) => getSpot(id)?.name ?? id;
export function followupFor(a: AlertRow, sentAt: number, secret = feedbackSecret()): EmailTemplate {
  const t = makeToken(a.id, sentAt, secret);
  return howdItGoEmail(spotName(a.spot_id), a.window_start, a.window_end, { caught: answerUrl(t, "caught"), nothing: answerUrl(t, "nothing"), didnt_go: answerUrl(t, "didnt_go") });
}
export interface FollowupSent { alert_id: string; followup_sent_at: string; email_id: string; }
/** One job run: send what's due; return the alerts_sent updates (followup_sent_at, followup_email_id). */
export async function runFollowups(alerts: AlertRow[], accounts: Record<string, FollowupAccount>, now = Date.now(), send = sendEmail): Promise<FollowupSent[]> {
  const out: FollowupSent[] = [];
  for (const a of dueFollowups(alerts, accounts, now)) {
    const m = await send(followupFor(a, now), accounts[a.user_id].email, `howd-it-go/${a.id}`);
    out.push({ alert_id: a.id, followup_sent_at: new Date(now).toISOString(), email_id: m.id });
  }
  return out;
}

// ------------------------------------------------------------------ storage
export interface FeedbackStore {
  alert(id: string): Promise<AlertRow | null>;
  feedback(alertId: string): Promise<FeedbackRow | null>;
  save(row: FeedbackRow): Promise<void>;                     // upsert on alert_id
}
export function memoryStore(alerts: AlertRow[] = []) {
  const a = new Map(alerts.map((x) => [x.id, x])), rows = new Map<string, FeedbackRow>();
  let writes = 0;
  return {
    alerts: a, rows, writes: () => writes,
    async alert(id: string) { return a.get(id) ?? null; },
    async feedback(id: string) { return rows.get(id) ?? null; },
    async save(r: FeedbackRow) { writes++; rows.set(r.alert_id, { ...r, species: [...r.species] }); },
  };
}
/** Service-role REST writes (bypass RLS) when Supabase is configured; otherwise one in-memory store. */
function supabaseStore(url: string, key: string): FeedbackStore {
  const h = { ...serviceHeaders(key), "Content-Type": "application/json" };
  const one = async <T>(path: string) => { const r = await fetch(`${url}/rest/v1/${path}`, { headers: h }); if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status}`); return ((await r.json()) as T[])[0] ?? null; };
  return {
    alert: (id) => one<AlertRow>(`alerts_sent?id=eq.${encodeURIComponent(id)}&select=id,user_id,spot_id,window_id,target_species,window_start,window_end,score,sent_at,followup_sent_at`),
    feedback: (id) => one<FeedbackRow>(`catch_feedback?alert_id=eq.${encodeURIComponent(id)}&select=*`),
    async save(row) {
      const r = await fetch(`${url}/rest/v1/catch_feedback?on_conflict=alert_id`, { method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error(`catch_feedback upsert ${r.status}`);
    },
  };
}
/** Mock mode: a demo alert (Bay of Islands, last evening) so the pages can be clicked through. */
export const DEMO_ALERT_ID = "00000000-0000-4000-8000-000000000001";
export function demoAlert(now = Date.now()): AlertRow {
  const y = nextDate(nzDate(now), -1);
  return { id: DEMO_ALERT_ID, user_id: "mock-user", spot_id: "bay_of_islands", window_start: new Date(nzAt(y, 17)).toISOString(), window_end: new Date(nzAt(y, 20)).toISOString(), window_id: null, target_species: null, score: 7.2, sent_at: new Date(nzAt(nextDate(y, -1), 7)).toISOString(), followup_sent_at: new Date(nzAt(nextDate(y), 8)).toISOString() };
}
const g = globalThis as unknown as { __feedbackStore?: ReturnType<typeof memoryStore> };
export function feedbackStore(): FeedbackStore {
  const sr = serviceRole();
  if (sr) return supabaseStore(sr.url, sr.key);
  return (g.__feedbackStore ??= memoryStore([demoAlert()]));
}

// ------------------------------------------------------------------ answering
/** As stored in alerts_sent; rows from before window_id existed get the same spot:start/end form. */
export const alertWindowId = (a: AlertRow) => a.window_id ?? `${a.spot_id}:${a.window_start}/${a.window_end}`;
/** Chips: the window's target species first (engine 2.4), then the rest of the spot's list. */
export function speciesFor(spotId: string, target?: string[] | null): string[] {
  const out: string[] = [];
  for (const s of [...(target ?? []), ...(getSpot(spotId)?.species ?? [])]) { const n = s.trim(); if (n && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n[0].toUpperCase() + n.slice(1)); }
  return out;
}
export interface FeedbackView { state: "ok" | "bad" | "expired" | "gone"; alert?: AlertRow; spot?: string; species: string[]; feedback: FeedbackRow | null; canChange: boolean; changeUntil?: number; }
const changeUntil = (f: FeedbackRow | null, exp: number) => Math.min(exp * 1000, f ? Date.parse(f.created_at) + CHANGE_DAYS * DAY : Infinity);
/** For the GET page. Read only: never writes. */
export async function viewFor(token: string, store: FeedbackStore, now = Date.now()): Promise<FeedbackView> {
  const v = verifyToken(token, now);
  if (!v.ok) return { state: v.reason, species: [], feedback: null, canChange: false };
  const alert = await store.alert(v.alertId);
  if (!alert) return { state: "gone", species: [], feedback: null, canChange: false };
  const feedback = await store.feedback(alert.id), until = changeUntil(feedback, v.exp);
  return { state: "ok", alert, spot: spotName(alert.spot_id), species: speciesFor(alert.spot_id, alert.target_species), feedback, canChange: now < until, changeUntil: until };
}
export type AnswerResult = { ok: true; row: FeedbackRow } | { ok: false; error: "bad" | "expired" | "gone" | "locked" | "bad_outcome" | "not_caught" };
async function load(token: string, store: FeedbackStore, now: number) {
  const v = verifyToken(token, now);
  if (!v.ok) return { err: v.reason } as const;
  const alert = await store.alert(v.alertId);
  if (!alert) return { err: "gone" } as const;
  const prev = await store.feedback(alert.id);
  if (prev && now >= changeUntil(prev, v.exp)) return { err: "locked" } as const;
  return { alert, prev };
}
/** POST: record or change the answer. Species are kept only while the answer is "caught". */
export async function recordAnswer(token: string, outcome: unknown, store: FeedbackStore, now = Date.now()): Promise<AnswerResult> {
  if (!isOutcome(outcome)) return { ok: false, error: "bad_outcome" };
  const l = await load(token, store, now);
  if ("err" in l) return { ok: false, error: l.err! };
  const { alert, prev } = l, at = new Date(now).toISOString();
  const row: FeedbackRow = {
    alert_id: alert.id, user_id: alert.user_id, spot_id: alert.spot_id, window_id: alertWindowId(alert), target_species: alert.target_species ?? null, window_start: alert.window_start, window_end: alert.window_end, score: alert.score,
    outcome, species: outcome === "caught" && prev?.outcome === "caught" ? prev.species : [], created_at: prev?.created_at ?? at, updated_at: at,
  };
  await store.save(row);
  return { ok: true, row };
}
/** POST: species for a "caught" answer, limited to that spot's list. An empty list is "skip". */
export async function recordSpecies(token: string, species: unknown, store: FeedbackStore, now = Date.now()): Promise<AnswerResult> {
  const l = await load(token, store, now);
  if ("err" in l) return { ok: false, error: l.err! };
  const { alert, prev } = l;
  if (prev?.outcome !== "caught") return { ok: false, error: "not_caught" };
  const allowed = speciesFor(alert.spot_id, alert.target_species), want = (Array.isArray(species) ? species : [species]).map((s) => String(s ?? "").trim().toLowerCase());
  const picked = allowed.filter((s) => want.includes(s.toLowerCase())).slice(0, MAX_SPECIES);
  const row = { ...prev, species: picked, updated_at: new Date(now).toISOString() };
  await store.save(row);
  return { ok: true, row };
}

// ------------------------------------------------------------------ scoring + export
/** Caught / (caught + nothing). didnt_go is not a verdict on the forecast and is never counted. */
export function hitRate(rows: Pick<FeedbackRow, "outcome">[]) {
  const scored = rows.filter((r) => r.outcome !== "didnt_go"), caught = scored.filter((r) => r.outcome === "caught").length;
  return { answers: scored.length, caught, rate: scored.length ? caught / scored.length : null };
}
export function hitRateBy<K extends string>(rows: FeedbackRow[], keyOf: (r: FeedbackRow) => K): Record<K, ReturnType<typeof hitRate>> {
  const groups = {} as Record<K, FeedbackRow[]>;
  for (const r of rows) (groups[keyOf(r)] ??= []).push(r);
  return Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, hitRate(v as FeedbackRow[])])) as Record<K, ReturnType<typeof hitRate>>;
}
/** One row per answer for Forecast Brain. Built field by field so nothing else can leak in. */
export interface ExportRow { spot_id: string; window_id: string; target_species: string[] | null; window_start: string; window_end: string; score: number; outcome: Outcome; species: string[]; }
export const exportForBrain = (rows: FeedbackRow[]): ExportRow[] =>
  rows.map((r) => ({ spot_id: r.spot_id, window_id: r.window_id, target_species: r.target_species ? [...r.target_species] : null, window_start: new Date(r.window_start).toISOString(), window_end: new Date(r.window_end).toISOString(), score: r.score, outcome: r.outcome, species: [...r.species] }))
    .sort((a, b) => a.window_start.localeCompare(b.window_start) || a.spot_id.localeCompare(b.spot_id));
export const exportCsv = (rows: FeedbackRow[]) => ["spot_id,window_id,window_start,window_end,score,outcome,species,target_species", ...exportForBrain(rows).map((r) => [r.spot_id, r.window_id, r.window_start, r.window_end, r.score, r.outcome, `"${r.species.join(";")}"`, `"${(r.target_species ?? []).join(";")}"`].join(","))].join("\n");
