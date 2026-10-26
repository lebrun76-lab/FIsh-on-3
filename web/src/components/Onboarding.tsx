"use client";
// Sign-up nudges for signed-out visitors and the first-run home spot picker (see lib/onboarding.ts).
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, isPaid, FREE_FAV_LIMIT } from "@/lib/auth";
import { safeNext, safeSpotId, signupHref, WELCOME_MAX } from "@/lib/onboarding";
import type { SpotSummary } from "@/lib/summaries";
import { SpotCard } from "./SpotCard";

export interface PickSpot { id: string; name: string; region: string; island: string; coastal: boolean }
const short = (name: string) => name.split(" (")[0];

/** Home page, under the hero. Signed out: the sign-up nudge. Signed in with no spots: a prompt to pick one. */
export function HomeNudge() {
  const { user, favourites, ready } = useAuth();
  if (!ready || (user && favourites.length)) return null;
  if (user) return (
    <section className="rounded-2xl bg-salt-bone p-5 ring-1 ring-salt-navy/10">
      <h2 className="text-lg font-bold text-salt-navy">Where do you fish?</h2>
      <p className="mt-1 text-sm text-slate-700">Pick your home spot and its forecast comes up first, right here.</p>
      <Link href="/welcome" className="mt-4 inline-block rounded-full bg-salt-navy px-5 py-3 font-semibold text-white">Pick my spot</Link>
    </section>
  );
  return (
    <section className="rounded-2xl bg-salt-bone p-5 ring-1 ring-salt-navy/10">
      <h2 className="text-lg font-bold text-salt-navy">Tell us where you fish</h2>
      <p className="mt-1 text-sm text-slate-700">Save your home harbour and we'll put its forecast first every time you open the site. Free account, no card needed.</p>
      <Link href={signupHref("/")} className="mt-4 inline-block rounded-full bg-salt-red px-5 py-3 font-semibold text-white">Set up my spots</Link>
    </section>
  );
}

/** Home page, above the hero: a signed-in user's saved spots, home spot first. */
export function YourSpots({ all }: { all: SpotSummary[] }) {
  const { user, favourites, home, ready } = useAuth();
  if (!ready || !user || !favourites.length) return null;
  const mine = favourites.map((id) => all.find((s) => s.id === id)).filter(Boolean) as SpotSummary[];
  mine.sort((a, b) => (a.id === home ? -1 : b.id === home ? 1 : 0));
  if (!mine.length) return null;
  return (
    <section>
      <div className="mb-3 flex items-end justify-between"><h2 className="text-xl font-bold">Your spots</h2><Link href="/saved" className="text-sm text-ocean-700 font-semibold">Manage →</Link></div>
      <div className="grid gap-3 md:grid-cols-2">{mine.map((s) => (
        <div key={s.id}>{s.id === home && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Home spot</div>}<SpotCard s={s} /></div>
      ))}</div>
    </section>
  );
}

/** Spot page: a small card for signed-out visitors. */
export function SpotNudge({ id, name }: { id: string; name: string }) {
  const { user, ready } = useAuth();
  if (!ready || user) return null;
  return (
    <div className="rounded-2xl bg-salt-bone p-4 ring-1 ring-salt-navy/10 sm:flex sm:items-center sm:justify-between sm:gap-4">
      <div>
        <div className="font-semibold text-salt-navy">Fish here often?</div>
        <p className="mt-0.5 text-sm text-slate-700">Save {short(name)} as your home spot and we'll put it first when you open the site. On Pro we'll also email you when a good window's coming up. Free account, no card needed.</p>
      </div>
      <Link href={signupHref(`/spots/${id}`, id)} className="mt-3 inline-block shrink-0 rounded-full bg-salt-navy px-4 py-2 text-sm font-semibold text-white sm:mt-0">Save this spot</Link>
    </div>
  );
}

/** /welcome: runs after every sign-in. Saves a tapped spot, or asks for a home spot, then carries on. */
export function WelcomePicker({ spots }: { spots: PickSpot[] }) {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const save = safeSpotId(params.get("save"));
  const saveSpot = save && spots.some((s) => s.id === save) ? save : null;
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const once = useRef(false);
  const paid = isPaid(auth.plan);
  const max = paid ? WELCOME_MAX : FREE_FAV_LIMIT;
  const { ready, user, favourites, saveSpots } = auth;

  useEffect(() => {
    if (!ready || once.current) return;
    once.current = true;
    if (!user) { router.replace(signupHref(next, saveSpot)); return; }
    if (saveSpot) {
      const room = paid || favourites.length < FREE_FAV_LIMIT;
      if (!favourites.includes(saveSpot) && room) { saveSpots([saveSpot]).then(() => router.replace(next)); return; }
      if (favourites.includes(saveSpot)) { router.replace(next); return; }
      // Free plan already full: don't swap one out silently, send them on.
      router.replace(next); return;
    }
    if (favourites.length) { router.replace(next); return; }
    setAsking(true);
  }, [ready, user, favourites, saveSpot, paid, next, router, saveSpots]);

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hit = spots.filter((s) => !t || `${s.name} ${s.region}`.toLowerCase().includes(t));
    const by = new Map<string, PickSpot[]>();
    for (const s of [...hit].sort((a, b) => (a.island === b.island ? 0 : a.island === "North" ? -1 : 1) || a.region.localeCompare(b.region) || a.name.localeCompare(b.name))) by.set(s.region, [...(by.get(s.region) ?? []), s]);
    return [...by.entries()];
  }, [spots, q]);

  if (!asking) return <p className="pt-10 text-center text-sm text-slate-500">One moment...</p>;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= max ? p : [...p, id]));
  const go = async () => {
    setBusy(true); setErr(null);
    const r = await saveSpots(picked);
    setBusy(false);
    if (r.error) return setErr(r.error);
    router.replace(next);
  };
  return (
    <div className="mx-auto max-w-xl space-y-4 pt-6">
      <div>
        <h1 className="text-2xl font-bold">Where do you fish?</h1>
        <p className="mt-1 text-slate-600">{`Pick up to ${max} spots you fish most. The first one's your home spot and comes up first.${paid ? "" : ` Pro saves up to ${WELCOME_MAX}.`}`}</p>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a harbour, beach or region" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ocean-500" />
      {groups.length === 0 && <p className="text-sm text-slate-500">Nothing by that name yet. Try the region instead.</p>}
      {groups.map(([region, list]) => (
        <div key={region}>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{region}</div>
          <div className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-100">
            {list.map((s) => {
              const on = picked.includes(s.id);
              return (
                <button key={s.id} type="button" onClick={() => toggle(s.id)} aria-pressed={on} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                  <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{s.name}</span>{!s.coastal && <span className="text-xs text-slate-500">Freshwater</span>}</span>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${on ? "bg-salt-navy text-white" : "ring-1 ring-slate-300"}`}>{on ? (picked.indexOf(s.id) + 1) : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="sticky bottom-20 z-20 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 md:bottom-4">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => router.replace(next)} className="text-sm text-slate-500 underline">Skip for now</button>
          <div className="flex items-center gap-3">
            {err && <span role="alert" className="text-sm text-rose-600">{err}</span>}
            <button type="button" onClick={go} disabled={!picked.length || busy} className="rounded-full bg-salt-navy px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : picked.length > 1 ? `Save ${picked.length} spots` : "Save and carry on"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
