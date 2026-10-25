"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth, isPaid, type AlertPrefs } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function AccountView({ spots }: { spots: { id: string; name: string }[] }) {
  const { user, plan, trialEnds, setPlan, alerts, setAlerts, favourites, signOut, ready } = useAuth();
  const upgraded = useSearchParams().get("upgraded");
  if (!ready) return null;
  if (!user) return <div className="pt-10 text-center"><Link href="/signin?next=/account" className="rounded-full bg-ocean-900 px-5 py-3 font-semibold text-white">Sign in to manage your account</Link></div>;
  const pro = isPaid(plan);
  const upd = (p: Partial<AlertPrefs>) => setAlerts({ ...alerts, ...p });
  const names = favourites.map((id) => spots.find((s) => s.id === id)?.name).filter(Boolean);
  return (
    <div className="pt-6 space-y-4 max-w-2xl">
      {upgraded && <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">{plan === "trial" ? `Your ${BRAND.trialDays}-day Pro trial has started (mock). No card taken — we’ll email you 3 days before it ends, and it simply drops back to Free.` : "You’re on Pro (mock). In production this happens after Stripe Checkout."}</div>}
      <h1 className="text-2xl font-bold">Account</h1>
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-100 space-y-1">
        <div className="text-sm text-slate-500">Signed in as</div><div className="font-semibold">{user.email}</div>
        <div className="flex items-center justify-between pt-2">
          <div><span className="text-sm text-slate-500">Plan: </span><b>{plan === "pro" ? `Pro · $${BRAND.proPriceNzd}/mo` : plan === "trial" ? `Pro trial · ends ${trialEnds} · no card on file` : "Free"}</b></div>
          {pro ? <button onClick={() => setPlan("free")} className="text-sm text-ocean-700">{plan === "trial" ? "End trial" : "Manage billing (mock portal)"}</button> : <Link href="/pricing" className="rounded-full bg-ocean-900 px-4 py-2 text-sm font-semibold text-white">Upgrade</Link>}
        </div>
      </section>
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-100 space-y-4">
        <div className="flex items-center justify-between">
          <div><h2 className="font-bold">Fishing-window email alerts</h2><p className="text-sm text-slate-500">For your saved spots: {names.length ? names.join(", ") : "none yet"}</p></div>
          {!pro ? <span className="text-xs rounded-full bg-slate-100 px-2 py-1">🔒 Pro</span> : <button onClick={() => upd({ enabled: !alerts.enabled })} aria-pressed={alerts.enabled} className={`h-7 w-12 rounded-full p-0.5 transition ${alerts.enabled ? "bg-emerald-500" : "bg-slate-300"}`}><span className={`block h-6 w-6 rounded-full bg-white transition ${alerts.enabled ? "translate-x-5" : ""}`} /></button>}
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold">Alert type</div>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div className={`rounded-xl p-3 ring-1 ${pro ? "ring-ocean-500 bg-ocean-100/50" : "ring-slate-200 opacity-60"}`}>📅 Weekly outlook {pro ? "" : "🔒 Pro"}<br /><span className="text-slate-500">Thursday evening, best weekend window</span></div>
            <div className={`rounded-xl p-3 ring-1 ${pro ? "ring-ocean-500 bg-ocean-100/50" : "ring-slate-200 opacity-60"}`}>⚡ Instant “it’s on” alert {pro ? "" : "🔒 Pro"}<br /><span className="text-slate-500">As soon as a good window appears in the next 10 days</span></div>
          </div>
        </div>
        <fieldset disabled={!pro} className="space-y-3 disabled:opacity-50">
          <div><div className="mb-1 text-sm font-semibold">Only tell me when it’s {pro ? "" : "(Pro)"}</div>
            <div className="flex gap-2">{(["good", "great"] as const).map((r) => <button key={r} type="button" onClick={() => upd({ minRating: r })} className={`rounded-full px-3 py-1.5 text-sm capitalize ${alerts.minRating === r ? "bg-ocean-900 text-white" : "ring-1 ring-slate-200"}`}>{r} or better</button>)}</div></div>
          <div><div className="mb-1 text-sm font-semibold">Days I can fish</div>
            <div className="flex flex-wrap gap-1.5">{DAYS.map((d) => <button key={d} type="button" onClick={() => upd({ days: alerts.days.includes(d) ? alerts.days.filter((x) => x !== d) : [...alerts.days, d] })} className={`rounded-full px-3 py-1.5 text-sm ${alerts.days.includes(d) ? "bg-ocean-900 text-white" : "ring-1 ring-slate-200"}`}>{d}</button>)}</div></div>
          <label className="block text-sm font-semibold">Send at <input type="time" value={alerts.sendAt} onChange={(e) => upd({ sendAt: e.target.value })} className="ml-2 rounded-lg border border-slate-200 px-2 py-1 font-normal" /> <span className="font-normal text-slate-500">NZ time</span></label>
        </fieldset>
        <details className="rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-semibold">Preview the email</summary>
          <div className="mt-2 space-y-1"><div><b>Subject:</b> 🎣 Hauraki Gulf is on Saturday morning</div><div>Kia ora {user.name}, Saturday 6–10am looks great at Hauraki Gulf: light wind 4–7 kn, small swell ~0.4 m, high tide 8:10am. Get there early and fish the top of the tide. <span className="text-ocean-700 underline">See the forecast →</span></div><div className="text-xs text-slate-400">Unsubscribe · Change alert settings</div></div>
        </details>
      </section>
      <button onClick={signOut} className="text-sm text-rose-600">Sign out</button>
    </div>
  );
}
