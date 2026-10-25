import { notFound } from "next/navigation";
import { buildForecast, getSpot } from "@/lib/mock";
import { ForecastView } from "@/components/ForecastView";
export default async function SpotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const spot = getSpot(id);
  if (!spot) notFound();
  // Production: fetch(`${FORECAST_API_URL}/v1/spots/${id}/forecast?days=7`, { next: { revalidate: 1800 } })
  return <ForecastView f={buildForecast(spot, 10)} />;
}
