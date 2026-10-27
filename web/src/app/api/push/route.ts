// Phone alert settings for the signed-in user.
//   GET   -> { configured, enabled, spots_off }
//   POST  { action: "subscribe", subscription, spots_off? } | { action: "unsubscribe", endpoint } | { action: "settings", enabled?, spots_off? }
// Supabase: written as the user (RLS: own rows only). Mock sign-in in dev: a local file, with the
// browser's mock account sent along because there is no server session to read it from.
import { NextResponse } from "next/server";
import { authMode } from "@/lib/supabase/config";
import { serverSupabase } from "@/lib/supabase/server";
import { devStoreOn, readDev, vapid, writeDev, type DevUser, type Sub } from "@/lib/pushjob";
import type { AlertAccount } from "@/lib/alerts";

export const dynamic = "force-dynamic";
const bad = (m: string, status = 400) => NextResponse.json({ error: m }, { status });
const isSub = (s: unknown): s is Sub => { const x = s as Sub; return !!x && typeof x.endpoint === "string" && x.endpoint.startsWith("https://") && typeof x.keys?.p256dh === "string" && typeof x.keys?.auth === "string"; };
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : undefined);

export async function GET() {
  const configured = !!vapid();
  if (authMode() === "supabase") {
    const sb = await serverSupabase(), { data: { user } } = await sb!.auth.getUser();
    if (!user) return bad("Sign in first", 401);
    const { data } = await sb!.from("push_settings").select("enabled,spots_off").eq("user_id", user.id).maybeSingle();
    return NextResponse.json({ configured, enabled: !!data?.enabled, spots_off: data?.spots_off ?? [] });
  }
  return NextResponse.json({ configured, enabled: false, spots_off: [] }); // mock: the browser keeps its own copy
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b.action !== "string") return bad("Bad request");
  const spots_off = ids(b.spots_off);

  if (authMode() === "supabase") {
    const sb = (await serverSupabase())!, { data: { user } } = await sb.auth.getUser();
    if (!user) return bad("Sign in first", 401);
    if (b.action === "subscribe") {
      if (!isSub(b.subscription)) return bad("Bad subscription");
      const s = b.subscription;
      const e1 = (await sb.from("push_subscriptions").upsert({ user_id: user.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null }, { onConflict: "endpoint" })).error;
      const e2 = (await sb.from("push_settings").upsert({ user_id: user.id, enabled: true, ...(spots_off ? { spots_off } : {}) })).error;
      return e1 || e2 ? bad("Couldn't save that", 500) : NextResponse.json({ ok: true });
    }
    if (b.action === "unsubscribe") {
      if (typeof b.endpoint === "string") await sb.from("push_subscriptions").delete().eq("endpoint", b.endpoint);
      const { count } = await sb.from("push_subscriptions").select("endpoint", { count: "exact", head: true });
      if (!count) await sb.from("push_settings").upsert({ user_id: user.id, enabled: false });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "settings") {
      const { error } = await sb.from("push_settings").upsert({ user_id: user.id, ...(typeof b.enabled === "boolean" ? { enabled: b.enabled } : {}), ...(spots_off ? { spots_off } : {}) });
      return error ? bad("Couldn't save that", 500) : NextResponse.json({ ok: true });
    }
    return bad("Bad request");
  }

  if (!devStoreOn()) return bad("Phone alerts need sign-in", 501);
  const acc = b.account as (AlertAccount & { id?: string; favourites?: string[] }) | undefined;
  const id = typeof acc?.id === "string" ? acc.id : "mock";
  const all = readDev();
  let u: DevUser | undefined = all.find((x) => x.id === id);
  if (!u) all.push(u = { id, account: { plan: "free", paused_until: null, alerts_enabled: true, fishing_times: ["any"] }, favourites: [], push: { enabled: false, spots_off: [] }, subs: [], sent: [] });
  if (acc) { u.account = { plan: acc.plan, paused_until: acc.paused_until ?? null, alerts_enabled: true, fishing_times: acc.fishing_times ?? ["any"] }; u.favourites = ids(acc.favourites) ?? u.favourites; }
  if (spots_off) u.push.spots_off = spots_off;
  if (b.action === "subscribe") { if (!isSub(b.subscription)) return bad("Bad subscription"); const s = b.subscription; u.subs = [...u.subs.filter((x) => x.endpoint !== s.endpoint), { endpoint: s.endpoint, keys: s.keys }]; u.push.enabled = true; }
  else if (b.action === "unsubscribe") { u.subs = u.subs.filter((x) => x.endpoint !== b.endpoint); if (!u.subs.length) u.push.enabled = false; }
  else if (b.action === "settings") { if (typeof b.enabled === "boolean") u.push.enabled = b.enabled; }
  else return bad("Bad request");
  writeDev(all);
  return NextResponse.json({ ok: true });
}
