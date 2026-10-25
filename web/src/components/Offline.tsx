"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
/** Registers the service worker (public/sw.js). Stub for offline-at-the-ramp mode. */
export function SWRegister() {
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);
  return null;
}
export function OfflineButton({ spotId, pro }: { spotId: string; pro: boolean }) {
  const [saved, setSaved] = useState(false);
  if (!pro) return (
    <div className="rounded-2xl border border-dashed border-ocean-500/40 bg-ocean-100/40 p-3">
      <div className="font-semibold text-ocean-900">🔒 Offline at the boat ramp</div>
      <p className="text-sm text-slate-600">Save this forecast to your phone so it works with no signal.</p>
      <Link href="/pricing" className="mt-2 inline-block text-sm font-semibold text-ocean-700">Included in Pro →</Link>
    </div>
  );
  const save = async () => {
    const urls = [`/spots/${spotId}`, `/api/v1/spots/${spotId}/forecast?days=10`];
    if ("caches" in window) { const c = await caches.open("fishcast-offline-v1"); await c.addAll(urls).catch(() => {}); }
    setSaved(true);
  };
  return (
    <button onClick={save} className="rounded-2xl bg-white p-4 text-left ring-1 ring-slate-100">
      <div className="font-semibold">{saved ? "✅ Saved for offline" : "📶 Save for offline"}</div>
      <div className="text-sm text-slate-600">{saved ? "This forecast opens with no signal at the ramp." : "Works with no signal at the ramp (stub)."}</div>
    </button>
  );
}
export function OfflineIndicator() {
  const [off, setOff] = useState(false);
  useEffect(() => { const u = () => setOff(!navigator.onLine); u(); addEventListener("online", u); addEventListener("offline", u); return () => { removeEventListener("online", u); removeEventListener("offline", u); }; }, []);
  return off ? <div className="bg-slate-800 py-1 text-center text-xs text-white">📶 You’re offline — showing saved forecasts</div> : null;
}
