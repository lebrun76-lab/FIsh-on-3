"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { PAUSE_MONTHS, pauseEndDate, nzMidnight, pauseLabel, type PauseMonths } from "@/lib/pause";

/** "Pause for winter": Pro subscribers only (trials have no subscription to pause). */
export function PauseControl() {
  const { billingPlan, paused, pausedUntil, setPausedUntil } = useAuth();
  const [months, setMonths] = useState<PauseMonths>(3);
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  if (billingPlan !== "pro") return null;
  const call = async (path: string, body?: object) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message);
      setPausedUntil(j.paused_until);
    } catch { setErr(paused ? "Couldn't resume. Try again." : "Couldn't pause. Try again."); }
    setBusy(false);
  };
  if (paused && pausedUntil) return (
    <section id="pause" className="rounded-2xl bg-white p-5 ring-1 ring-slate-100 space-y-3">
      <h2 className="font-bold">Paused for winter</h2>
      <p className="text-sm text-slate-600">No charges and no alerts until {pauseLabel(pausedUntil)}. It starts again by itself. You can still use the free forecasts.</p>
      <button disabled={busy} onClick={() => call("/api/billing/resume")} className="rounded-full bg-ocean-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Resume now</button>
      {err && <p className="text-sm text-rose-600">{err}</p>}
    </section>
  );
  const until = pauseLabel(new Date(nzMidnight(pauseEndDate(months)) * 1000).toISOString());
  return (
    <section id="pause" className="rounded-2xl bg-white p-5 ring-1 ring-slate-100 space-y-3">
      <h2 className="font-bold">Pause for winter</h2>
      <p className="text-sm text-slate-600">Pause your subscription. No charges and no alerts until {until}. It starts again by itself.</p>
      <div role="radiogroup" aria-label="How many months" className="flex flex-wrap gap-2">
        {PAUSE_MONTHS.map((m) => (
          <button key={m} role="radio" aria-checked={m === months} onClick={() => setMonths(m)} className={`rounded-full px-3 py-1.5 text-sm ring-1 ${m === months ? "bg-ocean-900 text-white ring-ocean-900" : "bg-white text-slate-700 ring-slate-200"}`}>{m} {m === 1 ? "month" : "months"}</button>
        ))}
      </div>
      <button disabled={busy} onClick={() => call("/api/billing/pause", { months })} className="rounded-full bg-ocean-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Pause until {until}</button>
      {err && <p className="text-sm text-rose-600">{err}</p>}
    </section>
  );
}
