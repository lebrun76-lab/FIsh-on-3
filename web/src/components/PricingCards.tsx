"use client";
import { useRouter } from "next/navigation";
import { useAuth, isPaid } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
const FREE = ["Today’s call and best window for every spot", "Save 1 spot", "Tides, basic wind & swell", "Wind + swell safety check", "All fishing rules, sizes & closures (map)", "Species guide", "No intrusive ads"];
const PRO = ["Everything in Free", "7–10 day outlook for every spot", "Ranked “where to go” list with species & tactics", "Sea temperature and temperature breaks", "Email when a good window comes up", "Unlimited spots + catch log", "Offline mode for the boat ramp", "No ads at all"];
export function PricingCards() {
  const { user, plan, setPlan } = useAuth();
  const router = useRouter();
  const trial = () => { if (!user) return router.push("/signin?next=/pricing"); setPlan("trial"); router.push("/account?upgraded=1"); };
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
        <div className="flex items-center justify-between"><div className="text-lg font-bold">Pro</div><span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">{BRAND.trialDays} days free</span></div>
        <div className="mt-1 text-3xl font-extrabold">${BRAND.proPriceNzd}<span className="text-base font-normal text-ocean-100"> NZD / month</span></div>
        <div className="text-sm text-ocean-100">or ${BRAND.proAnnualNzd} / year (save {annualSave}%)</div>
        <ul className="mt-4 space-y-2 text-sm">{PRO.map((x) => <li key={x}>✓ {x}</li>)}</ul>
        <button onClick={trial} disabled={isPaid(plan)} className="mt-6 w-full rounded-full bg-white py-3 font-semibold text-ocean-950 disabled:opacity-60">{plan === "pro" ? "You’re on Pro" : plan === "trial" ? "Trial active" : `Start ${BRAND.trialDays}-day free trial, no card`}</button>
        <p className="mt-3 text-xs text-ocean-100">No card needed. We remind you 3 days before it ends, then it goes back to Free. You only pay if you sign up.</p>
      </div>
    </div>
  );
}
