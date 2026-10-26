import { SPECIES } from "@/lib/rules";
export const metadata = { title: "Species" };
export default function Species() {
  return (
    <div className="pt-6 space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold">Species guide</h1>
      <p className="text-slate-600">What to target, when, how, and the legal size.<span className="guest-only inline"> Free for everyone.</span></p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{SPECIES.map((s) => (
        <div key={s.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
          <div className="flex justify-between"><b>{s.name}{s.maori ? ` · ${s.maori}` : ""}</b><span className="text-xs text-slate-500">{s.water === "salt" ? "Saltwater" : "Freshwater"}</span></div>
          <div className="mt-1 text-sm"><b>{s.minSizeCm ? `Min ${s.minSizeCm} cm` : "No min size"}</b> · {s.dailyBag ? `bag ${s.dailyBag}/day` : "limits vary by area"}</div>
          <div className="text-sm text-slate-600">Season: {s.season}</div>
          <div className="text-sm text-slate-600">How: {s.tactics}</div>
        </div>
      ))}</div>
      <p className="text-xs text-slate-400">A guide only, not verified, and many limits vary by fishery area. Check the official MPI rules before you fish.</p>
    </div>
  );
}
