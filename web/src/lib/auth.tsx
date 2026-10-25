"use client";
// MOCK AUTH + favourites in localStorage. Production: Supabase Auth (email magic link + Google)
// with favourites/alerts in Postgres behind row-level security.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Plan = "free" | "trial" | "pro";
export const isPaid = (p: Plan) => p !== "free";
export interface AlertPrefs { enabled: boolean; minRating: "great" | "good"; sendAt: string; days: string[]; }
interface State { trialEnds: string | null; user: { email: string; name: string } | null; plan: Plan; favourites: string[]; home: string | null; alerts: AlertPrefs; }
interface Ctx extends State {
  signIn: (email: string, name?: string) => void; signOut: () => void;
  toggleFav: (id: string) => void; setHome: (id: string) => void;
  setPlan: (p: Plan) => void; trialEnds: string | null; setAlerts: (a: AlertPrefs) => void; ready: boolean;
}
const DEFAULT: State = { trialEnds: null, user: null, plan: "free", favourites: [], home: null, alerts: { enabled: true, minRating: "good", sendAt: "18:00", days: ["Thu"] } };
const AuthCtx = createContext<Ctx | null>(null);
const KEY = "fishcast-mock-state";
export const FREE_FAV_LIMIT = 1;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(DEFAULT);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setS({ ...DEFAULT, ...JSON.parse(raw) }); } catch {}
    setReady(true);
  }, []);
  const save = (n: State) => { setS(n); localStorage.setItem(KEY, JSON.stringify(n)); };
  const value: Ctx = {
    ...s, ready,
    signIn: (email, name) => save({ ...s, user: { email, name: name ?? email.split("@")[0] } }),
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
