import { notFound } from "next/navigation";
import { getForecast } from "@/lib/forecasts";
import { ForecastView } from "@/components/ForecastView";
import { cropSst, loadSst, spotCaption } from "@/lib/sst";
import { getSpot } from "@/lib/mock";
import { RESERVES_CREDIT, reservesNear } from "@/lib/reserves";
export const revalidate = 1800;
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = getSpot(id);
  return s ? { title: `${s.name.split(" (")[0]} fishing forecast`, description: `When to go fishing at ${s.name.split(" (")[0]}: wind, swell, tides and whether it's worth going.`, alternates: { canonical: `/spots/${id}` } } : {};
}
export default async function SpotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await getForecast(id); // newest real forecast: Supabase (3-hourly refresh) or the committed job output; never mock
  if (!f) notFound();
  const all = f.spot.coastal && f.data_status !== "mock-fallback" ? await loadSst() : null;
  const mp = all?.spots[id]?.marine_point ?? [f.spot.lat, f.spot.lon];
  const sst = all ? { map: cropSst(all, mp[0], mp[1], f.spot.name), caption: spotCaption(all, id, f.spot.name) } : null;
  // Internal notes (engine version, model run, check notes) stay on the server; the page doesn't show them.
  const shown = { ...f, engine_version: undefined, model_run: "", warnings: undefined, spot: { ...f.spot, tide_note: undefined } };
  // DOC marine reserves within about 5 km of the spot (6 km allowing for the simplified outlines).
  const reserves = f.spot.coastal ? reservesNear(f.spot.lat, f.spot.lon).map((r) => r.name) : [];
  return <ForecastView f={shown} sst={sst} reserves={reserves} reservesCredit={RESERVES_CREDIT} />;
}
