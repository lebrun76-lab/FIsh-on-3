import { allSummaries } from "@/lib/summaries";
import { SpotsBrowser } from "@/components/SpotsBrowser";
export default function SpotsPage() {
  return (
    <div className="pt-6 space-y-3">
      <h1 className="text-2xl font-bold">Find a spot</h1>
      <SpotsBrowser spots={allSummaries()} />
    </div>
  );
}

export const revalidate = 1800; // ISR: refresh forecasts every 30 min
