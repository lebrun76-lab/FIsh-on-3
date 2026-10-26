import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { SPOTS } from "@/lib/mock";
import { SPOT_BANNERS, type Photo } from "@/lib/photos";
export const metadata = { title: "Credits" };

const spotName = (id: string) => SPOTS.find((s) => s.id === id)?.name.split(" (")[0] ?? id;
const ext = { rel: "noopener noreferrer", target: "_blank" } as const;

export default function Credits() {
  const third = Object.entries(SPOT_BANNERS).filter((e): e is [string, Photo & { credit: NonNullable<Photo["credit"]> }] => !!e[1].credit);
  return (
    <div className="pt-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl md:text-3xl font-bold">Credits</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Photos</h2>
        <p className="text-sm text-slate-700">Unless listed below, photos on {BRAND.name} are by Alex Le Brun.</p>
        <p className="text-sm text-slate-700">These spot photos are from Wikimedia Commons. We resized them, removed their metadata and show them cropped to a wide banner. The CC BY-SA ones, as resized and cropped here, stay under the same CC BY-SA licence.</p>
        <ul className="divide-y divide-slate-200 rounded-2xl bg-white text-sm ring-1 ring-slate-200">
          {third.map(([id, p]) => (
            <li key={id} className="p-3">
              <div className="font-semibold"><Link href={`/spots/${id}`} className="hover:underline">{spotName(id)}</Link>: {p.place}</div>
              <div className="text-slate-600">
                Photo: <a href={p.credit.sourceUrl} {...ext} className="underline">{p.credit.author}</a>, <a href={p.credit.licenceUrl} {...ext} rel="license noopener noreferrer" className="underline">{p.credit.licence}</a>, via Wikimedia Commons. Resized and cropped{p.credit.licence.includes("BY-SA") ? `; shared under ${p.credit.licence}` : ""}.
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Logo font</h2>
        <p className="text-sm text-slate-700">The {BRAND.name} logo and icons are drawn from <a href="https://github.com/googlefonts/AntonFont" {...ext} className="underline">Anton</a> by Vernon Adams, © 2020 The Anton Project Authors, used under the <a href="https://openfontlicense.org" {...ext} className="underline">SIL Open Font License 1.1</a>. The letters are converted to outlines; no font files are served.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Data</h2>
        <p className="text-sm text-slate-700">Weather, marine and sea temperature data: <a href="https://open-meteo.com" {...ext} className="underline">Open-Meteo</a> (CC BY 4.0). Tide predictions: <a href="https://www.linz.govt.nz" {...ext} className="underline">LINZ</a> (CC BY 4.0), not for navigation.</p>
      </section>
    </div>
  );
}
