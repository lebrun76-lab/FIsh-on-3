import { notFound } from "next/navigation";
import { getForecast } from "@/lib/forecasts";
import { ForecastView } from "@/components/ForecastView";
import { cropSst, loadSst, spotCaption } from "@/lib/sst";
export const revalidate = 1800;
export default async function SpotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = getForecast(id); // engine output from jobs/run_forecasts.py; labelled mock fallback if missing
  if (!f) notFound();
  const all = f.spot.coastal && f.data_status !== "mock-fallback" ? loadSst() : null;
  const mp = all?.spots[id]?.marine_point ?? [f.spot.lat, f.spot.lon];
  const sst = all ? { map: cropSst(all, mp[0], mp[1], f.spot.name), caption: spotCaption(all, id, f.spot.name) } : null;
  return <ForecastView f={f} sst={sst} />;
}
