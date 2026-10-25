"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth, isPaid, type AlertPrefs } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import type { EmailTemplate } from "@/lib/emails";
import { FishTimesPicker } from "@/components/FishTimesPicker";
import { fitsTimes } from "@/lib/fishtimes";
import { pickOf } from "@/lib/call";

/** Per spot: every window the alert could pick (1 to 2 days ahead, >= 4.5) with its email, built on the server. */
export type AlertPreview = { verdictStart: string | null; cands: { start: string; end: string; score: number; email: EmailTemplate }[] };
export function AccountView({ spots, alerts: alertMails, welcome, trial }: { spots: { id: string; name: string }[]; alerts: Record<string, AlertPreview>; welcome: EmailTemplate; trial: EmailTemplate }) {
  const { user, plan, trialEnds, setPlan, alerts, setAlerts, favourites, signOut, ready, fishingTimes, setFishingTimes } = useAuth();
  const upgraded = useSearchParams().get("upgraded");
  if (!ready) return null;
  if (!user) return <div className="pt-10 text-center"><Link href="/signin?next=/account" className="rounded-full bg-ocean-900 px-5 py-3 font-semibold text-white">Sign in to manage your account</Link></div>;
  const pro = isPaid(plan);
  const upd = (p: Partial<AlertPrefs>) => setAlerts({ ...alerts, ...p });
  const previewSpot = favourites.find((id) => id in alertMails) ?? "hauraki_gulf";
  const pv = alertMails[previewSpot];
  const previewAlert = pv ? pickOf(pv.cands.filter((c) => fitsTimes(c.start, c.end, fishingTimes)), pv.verdictStart)?.email ?? null : null; // same rule as alertCall
  const names = favourites.map((id) => spots.find((s) => s.id === id)?.name).filter(Boolean);
  return (
    <div className="pt-6 space-y-4 max-w-2xl">
      {upgraded && <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">{plan === "trial" ? `Your ${BRAND.trialDays}-day Pro trial has started (mock). No card taken. We’ll email you 3 days before it ends, then it goes back to Free.` : "You’re on Pro (mock). In production this happens after Stripe Checkout."}</div>}
      <h1 className="text-2xl font-bold">Account</h1>
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-100 space-y-1">
        <div className="text-sm text-slate-500">Signed in as</div><div className="font-semibold">{user.email}</div>
        <div className="flex items-center justify-between pt-2">
          <div><span className="text-sm text-slate-500">Plan: </span><b>{plan === "pro" ? `Pro · $${BRAND.proPriceNzd}/mo` : plan === "trial" ? `Pro trial · ends ${trialEnds} · no card on file` : "Free"}</b></div>
          {pro ? <button onClick={() => setPlan("free")} className="text-sm text-ocean-700">{plan === "trial" ? "End trial" : "Manage billing (mock portal)"}</button> : <Link href="/pricing" className="rounded-full bg-ocean-900 px-4 py-2 text-sm font-semibold text-white">Upgrade</Link>}
        </div>
      </section>
      <section id="fishing-times" className="rounded-2xl bg-white p-5 ring-1 ring-slate-100">
        <FishTimesPicker value={fishingTimes} onChange={setFishingTimes} />
      </section>
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-100 space-y-4">
        <div className="flex items-center justify-between">
          <div><h2 className="font-bold">Fishing-window email alerts</h2><p className="text-sm text-slate-500">For your saved spots: {names.length ? names.join(", ") : "none yet"}</p></div>
          {!pro ? <span className="text-xs rounded-full bg-slate-100 px-2 py-1">Pro</span> : <button onClick={() => upd({ enabled: !alerts.enabled })} aria-pressed={alerts.enabled} className={`h-7 w-12 rounded-full p-0.5 transition ${alerts.enabled ? "bg-emerald-500" : "bg-slate-300"}`}><span className={`block h-6 w-6 rounded-full bg-white transition ${alerts.enabled ? "translate-x-5" : ""}`} /></button>}
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold">Alert type</div>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div className={`rounded-xl p-3 ring-1 ${pro ? "ring-ocean-500 bg-ocean-100/50" : "ring-slate-200 opacity-60"}`}>Weekly outlook {pro ? "" : "(Pro)"}<br /><span className="text-slate-500">Thursday evening: the best weekend window</span></div>
            <div className={`rounded-xl p-3 ring-1 ${pro ? "ring-ocean-500 bg-ocean-100/50" : "ring-slate-200 opacity-60"}`}>“It’s on” alert {pro ? "" : "(Pro)"}<br /><span className="text-slate-500">When a good window shows up 1 to 2 days ahead</span></div>
          </div>
        </div>
        <fieldset disabled={!pro} className="space-y-3 disabled:opacity-50">
          <label className="block text-sm font-semibold">Send at <input type="time" value={alerts.sendAt} onChange={(e) => upd({ sendAt: e.target.value })} className="ml-2 rounded-lg border border-slate-200 px-2 py-1 font-normal" /> <span className="font-normal text-slate-500">NZ time</span></label>
        </fieldset>
        <p className="text-sm text-slate-600">We send at most two alerts a week, the best ones.</p>
        <details className="rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-semibold">Preview the emails</summary>
          <div className="mt-2 space-y-3">
            {!previewAlert && <p className="text-slate-500">No alert would go out for {spots.find((s) => s.id === previewSpot)?.name} right now: no fishable window 1 to 2 days ahead in your fishing times.</p>}
            {[previewAlert, welcome, trial].filter((m): m is EmailTemplate => !!m).map((m) => (
            <div key={m.kind} className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
              <div className="text-xs text-slate-500">From: {m.from}</div>
              <div><b>Subject:</b> {m.subject}</div>
              <div className="text-xs text-slate-500">Preview text: {m.preheader}</div>
              {m.body.map((p) => <p key={p} className="mt-1">{p}</p>)}
              <span className="mt-2 inline-block rounded-full bg-ocean-900 px-3 py-1 text-xs font-semibold text-white">{m.cta.label}</span>
              <div className="mt-1 text-xs text-slate-400">{m.footer} <span className="underline">{m.unsubscribe.label}</span></div>
            </div>))}
            <p className="text-xs text-slate-400">Example sender addresses only. Sending isn’t set up in the prototype.</p>
          </div>
        </details>
      </section>
      <button onClick={signOut} className="text-sm text-rose-600">Sign out</button>
    </div>
  );
}
