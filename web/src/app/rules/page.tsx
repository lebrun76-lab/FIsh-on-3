import { CLOSURES } from "@/lib/rules";
import { SPOTS } from "@/lib/mock";
import Link from "next/link";
export const metadata = { title: "Rules and closures" };
const X = (lon: number) => ((lon - 166) / 13.5) * 300 + 10;
const Y = (lat: number) => ((-34 - lat) / 13.5) * 380 + 10;
const COL: Record<string, string> = { "Marine reserve": "#e11d48", "Seasonal closure": "#f59e0b", "Rāhui": "#7c3aed", "Area rule": "#0ea5e9" };
export default function Rules() {
  return (
    <div className="pt-6 space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold">Rules & closures map</h1>
      <p className="text-slate-600">Marine reserves, seasonal closures, rāhui and area rules. Free for everyone. <Link href="/species" className="font-semibold text-ocean-700">Sizes & bag limits →</Link></p>
      <p className="rounded-xl bg-yellow-50 p-3 text-sm text-yellow-900 ring-1 ring-yellow-200">Sample data for the prototype, not verified. Production pulls MPI and DOC data with a “last checked” date and links to the official rule.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl bg-ocean-100 p-2 ring-1 ring-slate-100">
          <svg viewBox="0 0 320 400" className="w-full max-h-[70vh]">
            {SPOTS.map((s) => <circle key={s.id} cx={X(s.lon)} cy={Y(s.lat)} r={3} fill="#64748b" opacity={0.5} />)}
            {CLOSURES.map((c) => (<g key={c.id}><circle cx={X(c.lon)} cy={Y(c.lat)} r={14} fill={COL[c.type]} opacity={0.25} /><circle cx={X(c.lon)} cy={Y(c.lat)} r={5} fill={COL[c.type]} stroke="white" strokeWidth={1.5} /></g>))}
          </svg>
          <div className="flex flex-wrap gap-3 px-2 pb-1 text-xs">{Object.entries(COL).map(([k, v]) => <span key={k}><span className="inline-block h-2.5 w-2.5 rounded-full mr-1" style={{ background: v }} />{k}</span>)}</div>
        </div>
        <div className="space-y-2">{CLOSURES.map((c) => (
          <div key={c.id} className="rounded-2xl bg-white p-3 ring-1 ring-slate-100 text-sm"><div className="flex justify-between gap-2"><b>{c.name}</b><span className="text-xs rounded-full px-2 py-0.5 text-white" style={{ background: COL[c.type] }}>{c.type}</span></div><div className="text-slate-600">{c.rule}</div></div>
        ))}</div>
      </div>
    </div>
  );
}
