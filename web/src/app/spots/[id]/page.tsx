import { notFound } from "next/navigation";
import { getForecast } from "@/lib/forecasts";
import { ForecastView } from "@/components/ForecastView";
import { cropSst, loadSst, spotCaption } from "@/lib/sst";
import { getSpot } from "@/lib/mock";
export const revalidate = 1800;
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = getSpot(id);
  return s ? { title: `${s.name.split(" (")[0]} fishing forecast`, description: `When to go fishing at ${s.name.split(" (")[0]}: wind, swell, tides and the call in plain English.`, alternates: { canonical: `/spots/${id}` } } : {};
}
export default async function SpotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = getForecast(id); // engine output from jobs/run_forecasts.py; labelled mock fallback if missing
  if (!f) notFound();
  const all = f.spot.coastal && f.data_status !== "mock-fallback" ? loadSst() : null;
  const mp = all?.spots[id]?.marine_point ?? [f.spot.lat, f.spot.lon];
  const sst = all ? { map: cropSst(all, mp[0], mp[1], f.spot.name), caption: spotCaption(all, id, f.spot.name) } : null;
  return <ForecastView f={f} sst={sst} />;
}
