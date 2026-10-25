"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { SpotSummary } from "@/lib/summaries";
import { SpotCard } from "./SpotCard";
import { RATING_STYLE } from "./ui";

function MapView({ spots }: { spots: SpotSummary[] }) {
  // Simple lat/lon projection. Production: MapLibre GL + OpenStreetMap/MapTiler tiles.
  const X = (lon: number) => ((lon - 166) / 13.5) * 300 + 10;
  const Y = (lat: number) => ((-34 - lat) / 13.5) * 380 + 10;
  return (
    <div className="rounded-2xl bg-ocean-100 p-2 ring-1 ring-slate-100">
      <svg viewBox="0 0 320 400" className="w-full max-h-[70vh]">
        {spots.map((s) => (
          <Link key={s.id} href={`/spots/${s.id}`}>
            <circle cx={X(s.lon)} cy={Y(s.lat)} r={9} className={`${RATING_STYLE[s.rating].dot.replace("bg-", "fill-")} stroke-white`} strokeWidth={2} />
            <text x={X(s.lon) + 12} y={Y(s.lat) + 4} fontSize={10} className="fill-slate-800 font-medium">{s.name.split(" (")[0].split(" / ")[0]}</text>
          </Link>
        ))}
      </svg>
      <p className="px-2 pb-1 text-xs text-slate-500">Map preview · tap a dot. Real map tiles in production.</p>
    </div>
  );
}

export function SpotsBrowser({ spots }: { spots: SpotSummary[] }) {
  const [q, setQ] = useState("");
  const [island, setIsland] = useState<"All" | "North" | "South">("All");
  const [view, setView] = useState<"list" | "map">("list");
  const shown = useMemo(() => spots.filter((s) => (island === "All" || s.island === island) && `${s.name} ${s.region} ${s.species.join(" ")}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.score - a.score), [spots, q, island]);
  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a spot, region or fish (e.g. snapper)" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ocean-500" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(["All", "North", "South"] as const).map((i) => (
            <button key={i} onClick={() => setIsland(i)} className={`rounded-full px-3 py-1.5 text-sm ${island === i ? "bg-ocean-900 text-white" : "bg-white ring-1 ring-slate-200"}`}>{i === "All" ? "All NZ" : `${i} Is.`}</button>
          ))}
        </div>
        <div className="flex rounded-full bg-white ring-1 ring-slate-200 p-0.5 text-sm">
          {(["list", "map"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 capitalize ${view === v ? "bg-ocean-700 text-white" : ""}`}>{v}</button>)}
        </div>
      </div>
      {view === "map" ? <MapView spots={shown} /> : (
        <div className="grid gap-3 md:grid-cols-2">{shown.map((s) => <SpotCard key={s.id} s={s} />)}{!shown.length && <p className="text-slate-500">No spots match “{q}”.</p>}</div>
      )}
    </div>
  );
}
