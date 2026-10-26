"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth, isPaid, type AlertPrefs } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import type { EmailTemplate } from "@/lib/emails";
import { FishTimesPicker } from "@/components/FishTimesPicker";
import { fitsTimes } from "@/lib/fishtimes";
import { pickOf } from "@/lib/call";
import { PauseControl } from "@/components/PauseControl";
import { pauseLabel } from "@/lib/pause";

/** Per spot: every window the alert could pick (1 to 2 days ahead, >= 4.5) with its email, built on the server. */
export type AlertPreview = { verdictStart: string | null; cands: { start: string; end: string; score: number; email: EmailTemplate }[] };
export function AccountView({ spots, alerts: alertMails, welcome, trial }: { spots: { id: string; name: string }[]; alerts: Record<string, AlertPreview>; welcome: EmailTemplate; trial: EmailTemplate }) {
  const { user, billingPlan: plan, paused, pausedUntil, trialEnds, setPlan, alerts, setAlerts, favourites, signOut, ready, fishingTimes, setFishingTimes } = useAuth();
  const q = useSearchParams();
  const upgraded = q.get("upgraded") ?? (q.get("checkout") === "success" ? "stripe" : null);
  const sessionId = q.get("session_id");
  const [billingMsg, setBillingMsg] = useState<string | null>(null);
  // Back from Stripe Checkout (test mode): read what the session started and mirror it in the mock profile.
  // Production: the webhook writes profiles.plan and the page just reads it.
  useEffect(() => {
    if (!ready || !sessionId) return;
    fetch(`/api/billing/session?id=${encodeURIComponent(sessionId)}`).then((r) => r.json()).then((j) => {
      if (j?.plan === "trial") setPlan("trial", j.trial_end ? new Date(j.trial_end).toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" }) : null);
      else if (j?.plan === "pro" || j?.plan === "pro_annual") setPlan("pro");
    }).catch(() => {});
  }, [ready, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Stripe Customer portal for card and cancelling; the mock just drops to Free.
  const openPortal = async () => {
    setBillingMsg(null);
    try {
      const r = await fetch("/api/billing/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: user?.email }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? "Couldn't open billing");
      if (j.mock) { setPlan("free"); return; }
      window.location.href = j.url;
    } catch (e) { setBillingMsg((e as Error).message); }
  };
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
      {upgraded && <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">{plan === "trial" ? `Your ${BRAND.trialDays}-day Pro trial has started. No card taken. We’ll email you 3 days before it ends. Add a card to keep Pro, or it goes back to Free.` : upgraded === "stripe" ? "You’re on Pro. Thanks." : "You’re on Pro. Payments are switched off on this copy, so nothing was charged."}</div>}
      <h1 className="text-2xl font-bold">Account</h1>
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-100 space-y-1">
        <div className="text-sm text-slate-500">Signed in as</div><div className="font-semibold">{user.email}</div>
        <div className="flex items-center justify-between pt-2">
          <div><span className="text-sm text-slate-500">Plan: </span><b>{plan === "pro" && paused && pausedUntil ? `Pro · paused until ${pauseLabel(pausedUntil)}` : plan === "pro" ? `Pro · $${BRAND.proPriceNzd}/mo` : plan === "trial" ? `Pro trial · ends ${trialEnds} · no card on file` : "Free"}</b></div>
          {pro ? <button onClick={openPortal} className="text-sm text-ocean-700">{plan === "trial" ? "Add a card or end trial" : "Card and cancelling"}</button> : <Link href="/pricing" className="rounded-full bg-ocean-900 px-4 py-2 text-sm font-semibold text-white">Upgrade</Link>}
        </div>
      </section>
      {billingMsg && <p role="alert" className="text-sm text-amber-700">{billingMsg}</p>}
      <PauseControl />
      <section id="fishing-times" className="rounded-2xl bg-white p-5 ring-1 ring-slate-100">
        <FishTimesPicker value={fishingTimes} onChange={setFishingTimes} />
      </section>
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-100 space-y-4">
        <div className="flex items-center justify-between">
          <div><h2 className="font-bold">Fishing-window email alerts</h2><p className="text-sm text-slate-500">For your saved spots: {names.length ? names.join(", ") : "none yet"}</p></div>
          {!pro ? <span className="text-xs rounded-full bg-slate-100 px-2 py-1">Pro</span> : <button disabled={paused} onClick={() => upd({ enabled: !alerts.enabled })} aria-pressed={alerts.enabled} className={`h-7 w-12 rounded-full p-0.5 transition disabled:opacity-50 ${alerts.enabled ? "bg-emerald-500" : "bg-slate-300"}`}><span className={`block h-6 w-6 rounded-full bg-white transition ${alerts.enabled ? "translate-x-5" : ""}`} /></button>}
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold">Alert type</div>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div className={`rounded-xl p-3 ring-1 ${pro ? "ring-ocean-500 bg-ocean-100/50" : "ring-slate-200 opacity-60"}`}>Weekly outlook {pro ? "" : "(Pro)"}<br /><span className="text-slate-500">Thursday evening: the best weekend window</span></div>
            <div className={`rounded-xl p-3 ring-1 ${pro ? "ring-ocean-500 bg-ocean-100/50" : "ring-slate-200 opacity-60"}`}>“It’s on” alert {pro ? "" : "(Pro)"}<br /><span className="text-slate-500">When a good window shows up 1 to 2 days ahead</span></div>
          </div>
        </div>
        {paused && pausedUntil && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">Alerts are paused until {pauseLabel(pausedUntil)}.</p>}
        <fieldset disabled={!pro || paused} className="space-y-3 disabled:opacity-50">
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
