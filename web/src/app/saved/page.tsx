import { allSummaries } from "@/lib/summaries";
import { SavedList } from "@/components/SavedList";
export const metadata = { title: "Saved spots" };
export default function Saved() { return <SavedList all={allSummaries()} />; }

export const revalidate = 1800; // ISR: refresh forecasts every 30 min
