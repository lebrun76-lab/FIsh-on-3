import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { PhotoSlot } from "@/components/ui";
export const metadata = { title: "About" };
export default function About() {
  return (
    <div className="pt-6 space-y-4 max-w-2xl">
      <h1 className="text-2xl md:text-3xl font-bold">About {BRAND.name}</h1>
      <PhotoSlot id="about-main" subject="local fisher on a wharf or rocks, real person, natural light" ratio="3:2" />
      <p className="text-slate-700">Most forecasts give you numbers and leave the call to you. We make the call. For each spot we look at wind, waves, swell, tide and water temp, and tell you whether it’s worth going and which few hours are best.</p>
      <p className="text-slate-700">The forecasts come from public weather and ocean models (Open-Meteo, CC BY 4.0) and LINZ tide predictions. When the models disagree, we say so. When nothing’s worth going for, we say that too.</p>
      <p className="text-slate-700">It’s a guide, not a guarantee. Check the MetService marine forecast and conditions on the day, and tell someone your plans.</p>
      <p className="text-sm text-slate-500">Contact (example address): {BRAND.emails.hello} · <Link href="/spots" className="text-ocean-700 underline">Check a spot</Link></p>
    </div>
  );
}
