import { Suspense } from "react";
import { allSummaries } from "@/lib/summaries";
import { WelcomePicker, type PickSpot } from "@/components/Onboarding";
export const metadata = { title: "Your spots", robots: { index: false } };
export default function Welcome() {
  const spots: PickSpot[] = allSummaries().map((s) => ({ id: s.id, name: s.name, region: s.region, island: s.island, coastal: s.coastal }));
  return <Suspense><WelcomePicker spots={spots} /></Suspense>;
}
