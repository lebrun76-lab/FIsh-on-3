"use client";
// MOCK AUTH + favourites in localStorage. Production: Supabase Auth (email magic link + Google)
// with favourites/alerts in Postgres behind row-level security.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_FISH_TIMES, normaliseTimes, type FishTime } from "./fishtimes";

export type Plan = "free" | "trial" | "pro";
export const isPaid = (p: Plan) => p !== "free";
export interface AlertPrefs { enabled: boolean; minRating: "great" | "good"; sendAt: string; }
interface State { trialEnds: string | null; user: { email: string; name: string } | null; plan: Plan; favourites: string[]; home: string | null; alerts: AlertPrefs; fishingTimes: FishTime[]; } // fishingTimes = profiles.fishing_times
interface Ctx extends State {
  signIn: (email: string, name?: string, fishingTimes?: FishTime[]) => void; setFishingTimes: (t: FishTime[]) => void; signOut: () => void;
  toggleFav: (id: string) => void; setHome: (id: string) => void;
  setPlan: (p: Plan) => void; trialEnds: string | null; setAlerts: (a: AlertPrefs) => void; ready: boolean;
}
const DEFAULT: State = { trialEnds: null, user: null, plan: "free", favourites: [], home: null, alerts: { enabled: true, minRating: "good", sendAt: "18:00" }, fishingTimes: DEFAULT_FISH_TIMES };
const AuthCtx = createContext<Ctx | null>(null);
const KEY = "saltsupply-mock-state";
const LEGACY_KEY = "fishcast-mock-state"; // pre-rename prototype state, read once and migrated
export const FREE_FAV_LIMIT = 1;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(DEFAULT);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY); if (raw) { const v = { ...DEFAULT, ...JSON.parse(raw) }; setS({ ...v, fishingTimes: normaliseTimes(v.fishingTimes) }); } } catch {}
    setReady(true);
  }, []);
  const save = (n: State) => { setS(n); localStorage.setItem(KEY, JSON.stringify(n)); };
  const value: Ctx = {
    ...s, ready,
    signIn: (email, name, fishingTimes) => save({ ...s, user: { email, name: name ?? email.split("@")[0] }, fishingTimes: fishingTimes ? normaliseTimes(fishingTimes) : s.fishingTimes }),
    setFishingTimes: (t) => save({ ...s, fishingTimes: normaliseTimes(t) }),
    signOut: () => save(DEFAULT),
    toggleFav: (id) => {
      if (s.favourites.includes(id)) return save({ ...s, favourites: s.favourites.filter((f) => f !== id) });
      if (s.plan === "free" && s.favourites.length >= FREE_FAV_LIMIT) { window.location.href = "/pricing?reason=spots"; return; }
      save({ ...s, favourites: [...s.favourites, id], home: s.home ?? id });
    },
    setHome: (id) => save({ ...s, home: id, favourites: s.favourites.includes(id) ? s.favourites : [...s.favourites, id] }),
    setPlan: (plan) => save({ ...s, plan, trialEnds: plan === "trial" ? new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) : null }),
    setAlerts: (alerts) => save({ ...s, alerts }),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export function useAuth() { const c = useContext(AuthCtx); if (!c) throw new Error("no AuthProvider"); return c; }
