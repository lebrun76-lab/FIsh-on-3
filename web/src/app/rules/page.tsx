import { CLOSURES } from "@/lib/rules";
import { SPOTS } from "@/lib/mock";
import Link from "next/link";
import { CatchCheck } from "@/components/CatchCheck";
import { RulesMap } from "@/components/RulesMap";
import { RESERVES, RESERVES_CREDIT } from "@/lib/reserves";
export const metadata = { title: "Rules and closures" };
export default function Rules() {
  return (
    <div className="pt-6 space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold">Rules & closures map</h1>
      <p className="text-slate-600">Marine reserves, seasonal closures, rāhui and area rules. <span className="guest-only inline">Free for everyone. </span><Link href="/species" className="font-semibold text-ocean-700">Sizes & bag limits →</Link></p>
      <p className="rounded-xl bg-yellow-50 p-3 text-sm text-yellow-900 ring-1 ring-yellow-200">A guide only, not verified. Rules change, so check the official MPI and DOC rules before you fish.</p>
      <div className="max-w-xl"><CatchCheck spots={SPOTS.map((s) => ({ id: s.id, name: s.name }))} /></div>
      <RulesMap closures={CLOSURES} reserves={RESERVES.map(({ id, name, d }) => ({ id, name, d }))} credit={RESERVES_CREDIT} />
    </div>
  );
}
