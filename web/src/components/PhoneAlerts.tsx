"use client";
// Phone alerts (Web Push). One switch: the browser asks for permission only when it's flipped on,
// never on page load. Then a switch per saved spot. Rule: lib/alerts.ts PUSH_RULE.
import { useEffect, useState } from "react";
import { useAuth, isPaid } from "@/lib/auth";
import { pauseLabel } from "@/lib/pause";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const LOCAL = "saltsupply-push";
const b64 = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4), raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
type State = "loading" | "unsupported" | "off" | "on" | "blocked";

function Switch({ on, onClick, disabled, label }: { on: boolean; onClick: () => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick} className={`h-7 w-12 shrink-0 rounded-full p-0.5 transition disabled:opacity-50 ${on ? "bg-emerald-500" : "bg-slate-300"}`}><span className={`block h-6 w-6 rounded-full bg-white transition ${on ? "translate-x-5" : ""}`} /></button>;
}

export function PhoneAlerts({ spots }: { spots: { id: string; name: string }[] }) {
  const { user, billingPlan: plan, paused, pausedUntil, favourites, fishingTimes } = useAuth();
  const pro = isPaid(plan);
  const [state, setState] = useState<State>("loading");
  const [off, setOff] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try { setOff(JSON.parse(localStorage.getItem(LOCAL) ?? "{}").spots_off ?? []); } catch {}
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
    if (Notification.permission === "denied") { setState("blocked"); return; }
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setState(s ? "on" : "off")).catch(() => setState("off"));
    fetch("/api/push").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.spots_off?.length) setOff(j.spots_off); }).catch(() => {});
  }, []);

  const account = { id: user?.email, plan, paused_until: paused ? pausedUntil : null, fishing_times: fishingTimes, favourites };
  const post = (body: object) => fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, account }) }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Couldn't save that"); });
  const keep = (spots_off: string[]) => { setOff(spots_off); localStorage.setItem(LOCAL, JSON.stringify({ spots_off })); };

  const toggle = async () => {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (state === "on") {
        const s = await reg.pushManager.getSubscription();
        await s?.unsubscribe();
        await post({ action: "unsubscribe", endpoint: s?.endpoint });
        setState("off");
      } else {
        const perm = await Notification.requestPermission(); // the only place the prompt appears
        if (perm !== "granted") { setState(perm === "denied" ? "blocked" : "off"); return; }
        const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(KEY!) });
        await post({ action: "subscribe", subscription: s.toJSON(), spots_off: off });
        setState("on");
      }
    } catch (e) { setMsg((e as Error).message || "That didn't work. Try again."); }
    finally { setBusy(false); }
  };
  const flip = (id: string) => { const next = off.includes(id) ? off.filter((x) => x !== id) : [...off, id]; keep(next); if (state === "on") post({ action: "settings", spots_off: next }).catch((e) => setMsg(e.message)); };

  const saved = favourites.map((id) => ({ id, name: spots.find((s) => s.id === id)?.name ?? id }));
  const on = state === "on";
  const canToggle = pro && !!KEY && !paused && (state === "on" || state === "off");
  return (
    <section id="alerts" className="scroll-mt-20 rounded-2xl bg-white p-5 ring-1 ring-slate-100 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="font-bold">Phone alerts</h2><p className="text-sm text-slate-500">A notification when a good or great window shows up 1 to 2 days ahead at a saved spot.</p></div>
        {!pro ? <span className="text-xs rounded-full bg-slate-100 px-2 py-1">Pro</span> : <Switch on={on} onClick={toggle} disabled={!canToggle || busy} label="Phone alerts" />}
      </div>
      {pro && !KEY && <p className="text-sm text-slate-500">Phone alerts aren’t switched on yet.</p>}
      {pro && KEY && state === "unsupported" && <p className="text-sm text-slate-600">This browser can’t do phone alerts. On iPhone, add the site to your Home Screen first, then open it from there.</p>}
      {pro && state === "blocked" && <p className="text-sm text-amber-800">Notifications are blocked for this site. Allow them in your browser settings, then come back.</p>}
      {paused && pausedUntil && pro && <p className="text-sm text-slate-500">Paused until {pauseLabel(pausedUntil)} with the rest of your alerts.</p>}
      {msg && <p role="alert" className="text-sm text-amber-700">{msg}</p>}
      {pro && (
        <div className={on ? "" : "opacity-60"}>
          {saved.length ? (
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
              {saved.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="truncate">{s.name}</span>
                  <Switch on={!off.includes(s.id)} onClick={() => flip(s.id)} disabled={!on} label={`Phone alerts for ${s.name}`} />
                </li>))}
            </ul>
          ) : <p className="text-sm text-slate-500">Save a spot to get phone alerts for it.</p>}
        </div>
      )}
      <p className="text-xs text-slate-500">One per spot a day at most, nothing between 9pm and 7am. Looks like: “Hauraki Gulf: good fishing Sat 6 to 10am.”</p>
    </section>
  );
}
