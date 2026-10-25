import { regionCalls } from "@/lib/summaries";
import { WhereToGo } from "@/components/WhereToGo";
import { SstMap } from "@/components/SstMap";
import { loadSst, nzCaption } from "@/lib/sst";
export const metadata = { title: "Where to go" };
export const revalidate = 1800;
export default function Page() {
  const sst = loadSst();
  return (
    <div className="pt-6 space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold">Where to go next</h1>
      <p className="text-slate-600">Every NZ region ranked, with one plain-English call each for the next fishing day (today, or tomorrow once today’s light has gone): when, where, what to target and the legal size.</p>
      <WhereToGo calls={regionCalls()} />
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Where the warm water is</h2>
        {sst ? <SstMap m={sst} title="Sea temperature around New Zealand" caption={[...nzCaption(sst), "Warm-water species (snapper, kingfish, tuna) follow the warmer water; temperature breaks are worth a look because bait gathers along them."]} />
          : <p className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-100">Sea-temperature map not available yet (the scheduled job hasn’t produced one).</p>}
      </section>
    </div>
  );
}
