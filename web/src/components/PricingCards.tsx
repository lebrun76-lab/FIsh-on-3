"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, isPaid } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
const FREE = ["Today’s call and best window for every spot", "Save 1 spot", "Tides, basic wind & swell", "Wind + swell safety check", "All fishing rules, sizes & closures (map)", "Species guide", "No intrusive ads"];
const PRO = ["Everything in Free", "7–10 day outlook for every spot", "Ranked “where to go” list with species & tactics", "Sea temperature and temperature breaks", "Email when a good window comes up", "Unlimited spots + catch log", "Offline mode for the boat ramp", "No ads at all"];
export function PricingCards() {
  const { user, plan, setPlan, hadTrial } = useAuth();
  const router = useRouter();
  const [interval, setBilling] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  // One trial per person: ask the server (Stripe / subscriptions) as well as the browser. Until it answers, go by the browser.
  const [serverTrial, setServerTrial] = useState(true);
  useEffect(() => {
    if (!user) return;
    let live = true;
    fetch("/api/billing/eligibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: user.email, email: user.email, had_trial: hadTrial }) })
      .then((r) => r.json()).then((j) => { if (live && typeof j?.trial === "boolean") setServerTrial(j.trial); }).catch(() => {});
    return () => { live = false; };
  }, [user, hadTrial]);
  const trialOffered = !hadTrial && serverTrial;
  // Stripe Checkout in test mode (subscription, NZD, 30-day no-card trial); the mock flag without a Stripe key.
  const trial = async () => {
    if (!user) return router.push("/signin?next=/pricing");
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interval, user_id: user.email, email: user.email, had_trial: hadTrial }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? "Checkout failed");
      if (j.mode === "test") { window.location.href = j.url; return; }
      setPlan(j.trial ? "trial" : "pro"); router.push("/account?upgraded=1");
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const annualSave = Math.round((1 - BRAND.proAnnualNzd / (BRAND.proPriceNzd * 12)) * 100);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
        <div className="text-lg font-bold">Free</div><div className="mt-1 text-3xl font-extrabold">$0</div>
        <div className="text-sm text-slate-500">Free. Safety and rules stay free.</div>
        <ul className="mt-4 space-y-2 text-sm">{FREE.map((x) => <li key={x}>✓ {x}</li>)}</ul>
        <button onClick={() => router.push(user ? "/spots" : "/signin")} className="mt-6 w-full rounded-full py-3 font-semibold ring-1 ring-slate-300">{user ? (plan === "free" ? "Current plan" : "Included") : "Sign up free"}</button>
      </div>
      <div className="rounded-3xl bg-ocean-950 p-6 text-white ring-2 ring-ocean-500">
        <div className="flex items-center justify-between"><div className="text-lg font-bold">Pro</div>{trialOffered && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">{BRAND.trialDays} days free</span>}</div>
        <div className="mt-1 text-3xl font-extrabold">${BRAND.proPriceNzd}<span className="text-base font-normal text-ocean-100"> NZD / month</span></div>
        <div className="text-sm text-ocean-100">or ${BRAND.proAnnualNzd} / year (save {annualSave}%)</div>
        <div role="radiogroup" aria-label="Billing" className="mt-3 inline-flex rounded-full bg-ocean-900 p-1 text-sm">
          {(["month", "year"] as const).map((i) => <button key={i} role="radio" aria-checked={interval === i} onClick={() => setBilling(i)} className={`rounded-full px-3 py-1 ${interval === i ? "bg-white font-semibold text-ocean-950" : "text-ocean-100"}`}>{i === "month" ? `Monthly $${BRAND.proPriceNzd}` : `Yearly $${BRAND.proAnnualNzd}`}</button>)}
        </div>
        <ul className="mt-4 space-y-2 text-sm">{PRO.map((x) => <li key={x}>✓ {x}</li>)}</ul>
        <button onClick={trial} disabled={isPaid(plan) || busy} className="mt-6 w-full rounded-full bg-white py-3 font-semibold text-ocean-950 disabled:opacity-60">{plan === "pro" ? "You’re on Pro" : plan === "trial" ? "Trial active" : busy ? "Opening checkout..." : trialOffered ? `Start ${BRAND.trialDays}-day free trial, no card` : "Subscribe"}</button>
        {err && <p role="alert" className="mt-2 text-sm text-amber-300">{err}</p>}
        <p className="mt-3 text-xs text-ocean-100">{trialOffered ? "No card needed. We email you 3 days before it ends. Add a card to keep Pro, or it goes back to Free. No surprise charges." : `You've had your free trial, so Pro starts straight away and is billed ${interval === "month" ? "monthly" : "yearly"}. Cancel any time from your account.`}</p>
      </div>
    </div>
  );
}
