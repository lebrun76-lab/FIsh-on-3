import { allSummaries } from "@/lib/summaries";
import { SavedList } from "@/components/SavedList";
export const metadata = { title: "Saved spots" };
export default async function Saved() { return <SavedList all={await allSummaries()} />; }

export const revalidate = 1800; // ISR: refresh forecasts every 30 min
