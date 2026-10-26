// Web Push (VAPID, no paid service): who's subscribed, and the send run after each forecast refresh.
// Supabase when the service key is set (tables in supabase/migrations/20261027120000_push.sql),
// otherwise a local dev file so the whole loop can be tried without a database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import webpush from "web-push";
import { planUserPush, sentRows, type AlertAccount, type PushSettings, type SentAlert } from "./alerts";
import { getForecast } from "./forecasts";
import { normaliseTimes } from "./fishtimes";
import { pushMessage } from "./push";
import { serviceHeaders, serviceRole } from "./supabase/config";
import type { SpotForecast } from "./types";

export interface Sub { endpoint: string; keys: { p256dh: string; auth: string } }
/** VAPID keys from env. Null = push is off (nothing sends, the toggle says so). */
export function vapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY, subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

// ---- local dev store (mock sign-in only: never used when Supabase is configured) -------------
export interface DevUser { id: string; account: AlertAccount; favourites: string[]; push: PushSettings; subs: Sub[]; sent: SentAlert[] }
const DEV_FILE = path.join(os.tmpdir(), "saltsupply-push-dev.json");
export const devStoreOn = () => !serviceRole() && process.env.NODE_ENV !== "production";
export const readDev = (): DevUser[] => { try { return JSON.parse(fs.readFileSync(DEV_FILE, "utf8")); } catch { return []; } };
export const writeDev = (u: DevUser[]) => fs.writeFileSync(DEV_FILE, JSON.stringify(u, null, 1));

// ---- Supabase (service role, server only) --------------------------------------------------
async function rest<T>(q: string, init?: RequestInit): Promise<T> {
  const sr = serviceRole()!;
  const r = await fetch(`${sr.url}/rest/v1/${q}`, { ...init, cache: "no-store", headers: { ...serviceHeaders(sr.key), "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`supabase ${q.split("?")[0]}: ${r.status}`);
  return (r.status === 204 ? null : await r.json()) as T;
}
async function loadUsers(now: number): Promise<DevUser[]> {
  if (!serviceRole()) return devStoreOn() ? readDev() : [];
  const settings = await rest<{ user_id: string; enabled: boolean; spots_off: string[] }[]>("push_settings?enabled=eq.true&select=user_id,enabled,spots_off");
  if (!settings.length) return [];
  const ids = `(${settings.map((s) => s.user_id).join(",")})`;
  const since = new Date(now - 3 * 864e5).toISOString();
  const [subs, profiles, favs, sent] = await Promise.all([
    rest<{ user_id: string; endpoint: string; p256dh: string; auth: string }[]>(`push_subscriptions?user_id=in.${ids}&select=user_id,endpoint,p256dh,auth`),
    rest<{ id: string; plan: AlertAccount["plan"]; paused_until: string | null; fishing_times: unknown }[]>(`profiles?id=in.${ids}&select=id,plan,paused_until,fishing_times`),
    rest<{ user_id: string; spot_id: string }[]>(`favourites?user_id=in.${ids}&select=user_id,spot_id`),
    rest<(SentAlert & { user_id: string })[]>(`alerts_sent?user_id=in.${ids}&channel=eq.push&sent_at=gte.${since}&select=user_id,spot_id,window_start,window_end,score,sent_at,channel`),
  ]);
  return settings.map((s) => {
    const p = profiles.find((x) => x.id === s.user_id);
    return {
      id: s.user_id, push: { enabled: s.enabled, spots_off: s.spots_off ?? [] },
      account: { plan: p?.plan ?? "free", paused_until: p?.paused_until ?? null, alerts_enabled: true, fishing_times: normaliseTimes(p?.fishing_times) },
      favourites: favs.filter((f) => f.user_id === s.user_id).map((f) => f.spot_id),
      subs: subs.filter((x) => x.user_id === s.user_id).map((x) => ({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } })),
      sent: sent.filter((x) => x.user_id === s.user_id),
    };
  });
}

/** Run once per forecast refresh. Same candidate rule as the email alerts (lib/alerts.ts, PUSH_RULE). */
export async function runPushAlerts(now = Date.now()) {
  const v = vapid();
  if (!v) return { push: "off", note: "VAPID keys not set" };
  webpush.setVapidDetails(v.subject, v.publicKey, v.privateKey);
  const users = await loadUsers(now);
  const cache = new Map<string, Promise<SpotForecast | null>>();
  const fc = (id: string) => cache.get(id) ?? cache.set(id, getForecast(id)).get(id)!;
  let sent = 0, gone = 0, failed = 0;
  const dev = !serviceRole();
  for (const u of users) {
    if (!u.subs.length) continue;
    const forecasts = (await Promise.all(u.favourites.map(fc))).filter((f): f is SpotForecast => !!f);
    const plan = planUserPush(u.account, u.push, forecasts, u.sent, now);
    if (!plan.length) continue;
    const ok: typeof plan = [];
    for (const p of plan) {
      const f = forecasts.find((x) => x.spot.id === p.spot_id)!;
      const msg = JSON.stringify(pushMessage(f.spot, p.call));
      let delivered = false;
      for (const s of [...u.subs]) {
        try { await webpush.sendNotification(s, msg, { TTL: 6 * 3600, urgency: "normal" }); delivered = true; sent++; }
        catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) { gone++; u.subs = u.subs.filter((x) => x.endpoint !== s.endpoint); if (!dev) await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" }); }
          else failed++;
        }
      }
      if (delivered) ok.push(p);
    }
    const rows = sentRows(ok, now, "push");
    if (dev) u.sent.push(...rows);
    else if (rows.length) await rest("alerts_sent", { method: "POST", headers: { Prefer: "return=minimal,resolution=ignore-duplicates" }, body: JSON.stringify(rows.map((r) => ({ ...r, user_id: u.id }))) });
  }
  if (dev) writeDev(users);
  return { push: "on", users: users.length, sent, gone, failed };
}
