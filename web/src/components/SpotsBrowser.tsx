"use client";
import { useEffect, useMemo, useState } from "react";
import type { SpotSummary } from "@/lib/summaries";
import { SpotCard } from "./SpotCard";
import { SpotMap } from "./SpotMap";
import { useAuth, isPaid } from "@/lib/auth";

export function SpotsBrowser({ spots }: { spots: SpotSummary[] }) {
  const [q, setQ] = useState("");
  const [island, setIsland] = useState<"All" | "North" | "South">("All");
  const [view, setViewState] = useState<"list" | "map">("list");
  const [mapIsland, setMapIsland] = useState<"North" | "South" | null>(null);
  const { favourites, plan } = useAuth();
  // Map shows one island at a time: the first saved spot's island, else the South Island.
  const defaultIsland = (spots.find((s) => s.id === favourites[0])?.island as "North" | "South" | undefined) ?? "South";
  const shownIsland = mapIsland ?? (island === "All" ? defaultIsland : island);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("view") === "map") setViewState("map"); }, []);
  const setView = (v: "list" | "map") => {
    setViewState(v);
    const u = new URL(window.location.href);
    if (v === "map") u.searchParams.set("view", "map"); else u.searchParams.delete("view");
    window.history.replaceState(null, "", u);
  };
  const shown = useMemo(() => spots.filter((s) => (island === "All" || s.island === island) && `${s.name} ${s.region} ${s.species.join(" ")}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.score - a.score), [spots, q, island]);
  const mapSpots = useMemo(() => spots.filter((s) => `${s.name} ${s.region} ${s.species.join(" ")}`.toLowerCase().includes(q.toLowerCase())), [spots, q]);
  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a spot, region or fish (e.g. snapper)" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ocean-500" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {view === "map"
            ? (["North", "South"] as const).map((i) => (
              <button key={i} onClick={() => { setMapIsland(i); setIsland(i); }} aria-pressed={shownIsland === i} className={`rounded-full px-3 py-1.5 text-sm ${shownIsland === i ? "bg-ocean-900 text-white" : "bg-white ring-1 ring-slate-200"}`}>{`${i} Is.`}</button>
            ))
            : (["All", "North", "South"] as const).map((i) => (
              <button key={i} onClick={() => { setIsland(i); setMapIsland(i === "All" ? null : i); }} aria-pressed={island === i} className={`rounded-full px-3 py-1.5 text-sm ${island === i ? "bg-ocean-900 text-white" : "bg-white ring-1 ring-slate-200"}`}>{i === "All" ? "All NZ" : `${i} Is.`}</button>
            ))}
        </div>
        <div className="flex rounded-full bg-white ring-1 ring-slate-200 p-0.5 text-sm">
          {(["list", "map"] as const).map((v) => <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`rounded-full px-3 py-1 capitalize ${view === v ? "bg-ocean-700 text-white" : ""}`}>{v}</button>)}
        </div>
      </div>
      {view === "map" ? <SpotMap spots={mapSpots} island={shownIsland} favourites={favourites} days={isPaid(plan) ? 7 : 1} /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{shown.map((s) => <SpotCard key={s.id} s={s} />)}{!shown.length && <p className="text-slate-500">No spots match “{q}”.</p>}</div>
      )}
    </div>
  );
}
