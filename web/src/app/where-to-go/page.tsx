import { regionCalls } from "@/lib/summaries";
import { WhereToGo } from "@/components/WhereToGo";
export const revalidate = 1800;
export default function Page() {
  return (
    <div className="pt-6 space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold">Where to go next</h1>
      <p className="text-slate-600">Every NZ region ranked, with one plain-English call each for the next fishing day (today, or tomorrow once today’s light has gone): when, where, what to target and the legal size.</p>
      <WhereToGo calls={regionCalls()} />
    </div>
  );
}
