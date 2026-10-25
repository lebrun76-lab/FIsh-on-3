import { notFound } from "next/navigation";
import { getForecast } from "@/lib/forecasts";
import { ForecastView } from "@/components/ForecastView";
export const revalidate = 1800;
export default async function SpotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = getForecast(id); // engine output from jobs/run_forecasts.py; labelled mock fallback if missing
  if (!f) notFound();
  return <ForecastView f={f} />;
}
