"use client";
import { useAuth, isPaid } from "@/lib/auth";
import { Locked } from "./Locked";
const SAMPLE = [["Sat 6:40am", "Hauraki Gulf", "Snapper", "38 cm", "4 kn NE · 0.4 m · rising tide"], ["Sun 7:15am", "Hauraki Gulf", "Kahawai", "45 cm", "7 kn E · 0.6 m · high tide"]];
export function CatchLog() {
  const { plan, ready } = useAuth();
  if (!ready) return null;
  if (!isPaid(plan)) return <Locked title="Catch log is a Pro feature" body="Log species, size and a photo. We attach the wind, swell and tide automatically so you learn what works at your spots." />;
  return (
    <div className="space-y-3">
      <button className="w-full rounded-2xl bg-ocean-900 py-3 font-semibold text-white">+ Log a catch (stub)</button>
      {SAMPLE.map((r) => <div key={r[0]} className="rounded-2xl bg-white p-3 ring-1 ring-slate-100 text-sm"><b>{r[2]} · {r[3]}</b> — {r[1]}, {r[0]}<div className="text-slate-500">{r[4]}</div></div>)}
      <p className="text-xs text-slate-400">Mock entries. Production: Supabase table with RLS; photos in Supabase Storage.</p>
    </div>
  );
}
