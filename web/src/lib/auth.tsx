"use client";
// Sign-in, profile and saved spots. Two back ends behind one hook:
// - Supabase (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY set): Supabase Auth (email link
//   or 6-digit code, Google). Profile, favourites and alert settings live in Postgres behind RLS
//   (supabase/migrations). Plan, trial and pause are written by the Stripe webhook only.
// - Mock (not set): everything in localStorage, as in the prototype.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { DEFAULT_FISH_TIMES, normaliseTimes, type FishTime } from "./fishtimes";
import { effectivePlan, isPaused } from "./pause";
import { BRAND } from "./brand";
import { authMode } from "./supabase/config";
import { browserSupabase } from "./supabase/client";

export type Plan = "free" | "trial" | "pro";
export const isPaid = (p: Plan) => p !== "free";
export interface AlertPrefs { enabled: boolean; sendAt: string; } // no threshold: alerts use the engine 4.5 bar (src/lib/alerts.ts)
// fishingTimes = profiles.fishing_times; pausedUntil = profiles.paused_until; hadTrial: this browser has started a trial (mock)
interface State { trialEnds: string | null; user: { email: string; name: string } | null; plan: Plan; favourites: string[]; home: string | null; alerts: AlertPrefs; fishingTimes: FishTime[]; pausedUntil: string | null; hadTrial: boolean; }
type Result = Promise<{ error?: string }>;
interface Ctx extends State {
  mode: "supabase" | "mock";
  /** plan = what the user can use (Free while paused); billingPlan = what they pay for. */
  billingPlan: Plan; paused: boolean; setPausedUntil: (iso: string | null) => void;
  /** Mock sign-in only. */
  signIn: (email: string, name?: string, fishingTimes?: FishTime[]) => void;
  /** Supabase: email a sign-in link (and code). */
  sendEmailLink: (email: string, fishingTimes: FishTime[], next: string) => Result;
  /** Supabase: the 6-digit code from that email, if the email template shows one. */
  verifyEmailCode: (email: string, code: string) => Result;
  /** Supabase: Google OAuth (redirects away). */
  signInWithGoogle: (fishingTimes: FishTime[], next: string) => Result;
  /** Reload the profile from the database (Supabase) after the webhook has written to it. */
  refresh: () => Promise<void>;
  setFishingTimes: (t: FishTime[]) => void; signOut: () => void;
  toggleFav: (id: string) => void; setHome: (id: string) => void;
  /** Onboarding: save several spots at once (first one becomes home if none is set). Respects the Free limit. */
  saveSpots: (ids: string[]) => Promise<{ error?: string }>;
  setPlan: (p: Plan, trialEnds?: string | null) => void; trialEnds: string | null; setAlerts: (a: AlertPrefs) => void; ready: boolean;
}
const DEFAULT: State = { trialEnds: null, user: null, plan: "free", favourites: [], home: null, alerts: { enabled: true, sendAt: "18:00" }, fishingTimes: DEFAULT_FISH_TIMES, pausedUntil: null, hadTrial: false };
const AuthCtx = createContext<Ctx | null>(null);
const KEY = "saltsupply-mock-state";
const LEGACY_KEY = "fishcast-mock-state"; // pre-rename prototype state, read once and migrated
const PENDING_TIMES = "saltsupply-pending-fishing-times"; // picked on the sign-in page, saved to the profile after sign-in
export const FREE_FAV_LIMIT = 1;
const trialEndDefault = () => new Date(Date.now() + BRAND.trialDays * 864e5).toISOString().slice(0, 10);
const nzDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" }) : null);

export function AuthProvider({ children }: { children: ReactNode }) {
  return authMode() === "supabase" ? <SupabaseAuth>{children}</SupabaseAuth> : <MockAuth>{children}</MockAuth>;
}
export function useAuth() { const c = useContext(AuthCtx); if (!c) throw new Error("no AuthProvider"); return c; }

const notInMock = async () => ({ error: "Real sign-in isn't set up on this copy" });

function MockAuth({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(DEFAULT);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY); if (raw) { const v = { ...DEFAULT, ...JSON.parse(raw) }; const { minRating: _old, ...alerts } = { ...DEFAULT.alerts, ...v.alerts }; setS({ ...v, alerts, fishingTimes: normaliseTimes(v.fishingTimes), pausedUntil: isPaused(v.pausedUntil) ? v.pausedUntil : null, hadTrial: !!v.hadTrial || v.plan !== "free" || !!v.trialEnds }); } } catch {}
    setReady(true);
  }, []);
  const save = (n: State) => { setS(n); localStorage.setItem(KEY, JSON.stringify(n)); };
  const value: Ctx = {
    ...s, mode: "mock", ready, billingPlan: s.plan, plan: effectivePlan(s.plan, s.pausedUntil), paused: isPaused(s.pausedUntil),
    setPausedUntil: (pausedUntil) => save({ ...s, pausedUntil }),
    signIn: (email, name, fishingTimes) => save({ ...s, user: { email, name: name ?? email.split("@")[0] }, fishingTimes: fishingTimes ? normaliseTimes(fishingTimes) : s.fishingTimes }),
    sendEmailLink: notInMock, verifyEmailCode: notInMock, signInWithGoogle: notInMock, refresh: async () => {},
    setFishingTimes: (t) => save({ ...s, fishingTimes: normaliseTimes(t) }),
    signOut: () => save({ ...DEFAULT, hadTrial: s.hadTrial }), // one trial per person, even after signing out of the mock
    toggleFav: (id) => {
      if (s.favourites.includes(id)) return save({ ...s, favourites: s.favourites.filter((f) => f !== id) });
      if (effectivePlan(s.plan, s.pausedUntil) === "free" && s.favourites.length >= FREE_FAV_LIMIT) { window.location.href = "/pricing?reason=spots"; return; }
      save({ ...s, favourites: [...s.favourites, id], home: s.home ?? id });
    },
    setHome: (id) => save({ ...s, home: id, favourites: s.favourites.includes(id) ? s.favourites : [...s.favourites, id] }),
    saveSpots: async (ids) => {
      const room = effectivePlan(s.plan, s.pausedUntil) === "free" ? Math.max(0, FREE_FAV_LIMIT - s.favourites.length) : ids.length;
      const add = ids.filter((id) => !s.favourites.includes(id)).slice(0, room);
      save({ ...s, favourites: [...s.favourites, ...add], home: s.home ?? add[0] ?? null });
      return {};
    },
    setPlan: (plan, trialEnds) => save({ ...s, plan, pausedUntil: null, hadTrial: s.hadTrial || plan !== "free", trialEnds: plan === "trial" ? trialEnds ?? trialEndDefault() : null }),
    setAlerts: (alerts) => save({ ...s, alerts }),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

interface ProfileRow { display_name: string | null; home_spot_id: string | null; plan: string; trial_ends_at: string | null; paused_until: string | null; fishing_times: string[] | null; alerts_enabled: boolean | null; alert_send_at: string | null }

function SupabaseAuth({ children }: { children: ReactNode }) {
  const sb = browserSupabase()!;
  const [s, setS] = useState<State>(DEFAULT);
  const [ready, setReady] = useState(false);
  const uid = useRef<string | null>(null);

  const load = useCallback(async (u: User | null) => {
    uid.current = u?.id ?? null;
    if (!u) { setS(DEFAULT); setReady(true); return; }
    const pending = localStorage.getItem(PENDING_TIMES);
    if (pending) {
      localStorage.removeItem(PENDING_TIMES);
      try { await sb.from("profiles").update({ fishing_times: normaliseTimes(JSON.parse(pending)) }).eq("id", u.id); } catch {}
    }
    const [{ data: p }, { data: favs }] = await Promise.all([
      sb.from("profiles").select("display_name, home_spot_id, plan, trial_ends_at, paused_until, fishing_times, alerts_enabled, alert_send_at").eq("id", u.id).maybeSingle<ProfileRow>(),
      sb.from("favourites").select("spot_id").eq("user_id", u.id).order("created_at"),
    ]);
    const plan: Plan = p?.plan === "trial" ? "trial" : p?.plan === "pro" || p?.plan === "pro_annual" ? "pro" : "free";
    setS({
      user: { email: u.email ?? "", name: p?.display_name || (u.email ?? "").split("@")[0] },
      plan, trialEnds: plan === "trial" ? nzDate(p?.trial_ends_at ?? null) : null,
      pausedUntil: p?.paused_until && isPaused(p.paused_until) ? p.paused_until : null,
      favourites: (favs ?? []).map((f) => f.spot_id as string), home: p?.home_spot_id ?? null,
      alerts: { enabled: p?.alerts_enabled ?? true, sendAt: p?.alert_send_at ?? "18:00" },
      fishingTimes: normaliseTimes((p?.fishing_times ?? DEFAULT_FISH_TIMES) as FishTime[]),
      hadTrial: plan !== "free" || !!p?.trial_ends_at,
    });
    setReady(true);
  }, [sb]);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => load(data.user));
    // Don't await Supabase calls inside this callback (it can deadlock the auth lock): defer them.
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") setTimeout(() => load(session?.user ?? null), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb, load]);

  const reload = async () => { const { data } = await sb.auth.getUser(); await load(data.user); };
  const patchProfile = async (row: Record<string, unknown>) => {
    if (!uid.current) return;
    const { error } = await sb.from("profiles").update(row).eq("id", uid.current);
    if (error) await reload();
  };
  const origin = () => window.location.origin;
  const callback = (next: string) => `${origin()}/auth/callback?next=${encodeURIComponent(next)}`;

  const value: Ctx = {
    ...s, mode: "supabase", ready, billingPlan: s.plan, plan: effectivePlan(s.plan, s.pausedUntil), paused: isPaused(s.pausedUntil),
    // The webhook writes pause / plan to the database; these only update the screen until the next load.
    setPausedUntil: (pausedUntil) => setS((x) => ({ ...x, pausedUntil })),
    setPlan: (plan, trialEnds) => setS((x) => ({ ...x, plan, pausedUntil: null, hadTrial: x.hadTrial || plan !== "free", trialEnds: plan === "trial" ? trialEnds ?? trialEndDefault() : null })),
    signIn: () => {},
    sendEmailLink: async (email, times, next) => {
      localStorage.setItem(PENDING_TIMES, JSON.stringify(times));
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: callback(next), shouldCreateUser: true } });
      return error ? { error: error.message } : {};
    },
    verifyEmailCode: async (email, code) => {
      const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: "email" });
      return error ? { error: error.message } : {};
    },
    signInWithGoogle: async (times, next) => {
      localStorage.setItem(PENDING_TIMES, JSON.stringify(times));
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback(next) } });
      return error ? { error: error.message } : {};
    },
    refresh: reload,
    setFishingTimes: (t) => { const v = normaliseTimes(t); setS((x) => ({ ...x, fishingTimes: v })); patchProfile({ fishing_times: v }); },
    setAlerts: (alerts) => { setS((x) => ({ ...x, alerts })); patchProfile({ alerts_enabled: alerts.enabled, alert_send_at: alerts.sendAt }); },
    signOut: () => { setS(DEFAULT); sb.auth.signOut().then(() => load(null)); },
    toggleFav: (id) => {
      const me = uid.current;
      if (!me) return;
      if (s.favourites.includes(id)) {
        setS((x) => ({ ...x, favourites: x.favourites.filter((f) => f !== id) }));
        sb.from("favourites").delete().eq("user_id", me).eq("spot_id", id).then(({ error }) => { if (error) reload(); });
        return;
      }
      if (effectivePlan(s.plan, s.pausedUntil) === "free" && s.favourites.length >= FREE_FAV_LIMIT) { window.location.href = "/pricing?reason=spots"; return; }
      const firstHome = !s.home;
      setS((x) => ({ ...x, favourites: [...x.favourites, id], home: x.home ?? id }));
      sb.from("favourites").insert({ user_id: me, spot_id: id }).then(({ error }) => {
        if (error) return reload();
        if (firstHome) patchProfile({ home_spot_id: id });
      });
    },
    setHome: (id) => {
      const me = uid.current;
      if (!me) return;
      const add = !s.favourites.includes(id);
      setS((x) => ({ ...x, home: id, favourites: add ? [...x.favourites, id] : x.favourites }));
      patchProfile({ home_spot_id: id });
      // The free plan's one-spot limit is also enforced in the database; if it refuses, reload shows the truth.
      if (add) sb.from("favourites").insert({ user_id: me, spot_id: id }).then(({ error }) => { if (error) reload(); });
    },
    saveSpots: async (ids) => {
      const me = uid.current;
      if (!me) return { error: "Not signed in" };
      const room = effectivePlan(s.plan, s.pausedUntil) === "free" ? Math.max(0, FREE_FAV_LIMIT - s.favourites.length) : ids.length;
      const add = ids.filter((id) => !s.favourites.includes(id)).slice(0, room);
      if (!add.length) return {};
      const home = s.home ?? add[0];
      // One row at a time, in order, so the database's Free-plan trigger counts them correctly.
      for (const id of add) {
        const { error } = await sb.from("favourites").insert({ user_id: me, spot_id: id });
        if (error) { await reload(); return { error: "Couldn't save that spot. Try again." }; }
      }
      if (!s.home) await sb.from("profiles").update({ home_spot_id: home }).eq("id", me);
      setS((x) => ({ ...x, favourites: [...x.favourites, ...add.filter((id) => !x.favourites.includes(id))], home: x.home ?? home }));
      return {};
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
