"use client";
// /rules map: the island map base with the rule items as markers and DOC reserves as flat outlines. No sea shading.
import { useEffect, useRef, useState } from "react";
import type { Closure } from "@/lib/rules";
import { IslandMapFrame, useIslandMap, type Island } from "./IslandMap";

export const RULE_COLOUR: Record<Closure["type"], string> = { "Marine reserve": "#B83A26", "Seasonal closure": "#d97706", "Rāhui": "#7c3aed", "Area rule": "#0369a1" };
export type ReserveShape = { id: string; name: string; d: string };

export function RulesMap({ closures, reserves, credit }: { closures: Closure[]; reserves: ReserveShape[]; credit?: string }) {
  const [island, setIsland] = useState<Island>("North");
  const [sel, setSel] = useState<string | null>(null);
  const m = useIslandMap(island);
  const items = useRef(new Map<string, HTMLElement>());
  const types = [...new Set(closures.map((c) => c.type))];
  const shown = closures.filter((c) => c.island === island);
  const pick = (id: string | null, fromMap = false) => {
    setSel(id);
    if (!id) return;
    const c = closures.find((x) => x.id === id);
    if (c && c.island !== island) setIsland(c.island);
    // Beside the map on desktop: bring the item into view in the list. On phones the list is below, so leave the page be.
    if (fromMap && window.matchMedia("(min-width: 768px)").matches) items.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);
  const w = m.view ? 1 / m.view.s : 1;

  return (
    <section aria-label="Rules map" className="space-y-2">
      <div role="group" aria-label="Island" className="flex gap-1.5">
        {(["North", "South"] as const).map((i) => (
          <button key={i} type="button" onClick={() => { setIsland(i); setSel(null); }} aria-pressed={island === i}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${island === i ? "bg-ocean-900 text-white ring-ocean-900" : "bg-white text-slate-700 ring-slate-200"}`}>{i} Island</button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:items-start">
        <div className="min-w-0 space-y-2">
          <IslandMapFrame m={m} island={island} onBackground={() => setSel(null)} className="h-[min(70vh,600px)] min-h-[420px]"
            label={`Map of rules and closures around the ${island} Island. Drag with two fingers or the mouse to pan. Pinch, or use the plus and minus buttons, to zoom.`}
            inMap={reserves.map((r) => <path key={r.id} d={r.d} fill="rgba(184,58,38,.12)" stroke={RULE_COLOUR["Marine reserve"]} strokeWidth={1.2 * w} strokeLinejoin="round" />)}>
            {m.view && shown.map((c) => {
              const [x, y] = m.toScreen(c.lon, c.lat), on = sel === c.id;
              return (
                <div key={c.id} className="absolute" style={{ left: x, top: y, zIndex: on ? 3 : 1 }}>
                  <button type="button" aria-label={`${c.name}: ${c.type}`} aria-pressed={on}
                    onClick={(e) => { e.stopPropagation(); if (m.moved.current < 6) pick(on ? null : c.id, true); }}
                    className="absolute -left-[22px] -top-[22px] flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ocean-700">
                    <span className="block rounded-full" style={{ width: on ? 18 : 13, height: on ? 18 : 13, background: RULE_COLOUR[c.type], border: "2px solid white", boxShadow: on ? "0 0 0 2.5px #0b3556" : "0 0 0 1px rgba(15,23,42,.35)" }} />
                  </button>
                </div>
              );
            })}
          </IslandMapFrame>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-slate-600">
            {types.map((t) => <span key={t} className="inline-flex items-center gap-1"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: RULE_COLOUR[t] }} />{t}</span>)}
            {reserves.length > 0 && <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "rgba(184,58,38,.12)", border: `1px solid ${RULE_COLOUR["Marine reserve"]}` }} />Reserve boundary</span>}
          </div>
          <div className="space-y-0.5 px-1 text-[11px] text-slate-400">
            <p className="font-semibold text-slate-500">Not for navigation. Check official charts and MPI rules.</p>
            <p>Coastline: Natural Earth.{reserves.length > 0 && credit ? ` ${credit}.` : ""}</p>
          </div>
        </div>
        <ul className="min-w-0 space-y-2">
          {closures.map((c) => {
            const on = sel === c.id;
            return (
              <li key={c.id} ref={(el) => { if (el) items.current.set(c.id, el); else items.current.delete(c.id); }}>
                <button type="button" onClick={() => pick(on ? null : c.id)} aria-pressed={on}
                  className={`block w-full rounded-2xl bg-white p-3 text-left text-sm ring-1 ${on ? "ring-2 ring-ocean-900" : "ring-slate-100"}`}>
                  <span className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RULE_COLOUR[c.type] }} />
                    <span className="min-w-0">
                      <span className="block break-words font-semibold text-slate-900">{c.name}</span>
                      <span className="block break-words text-slate-600">{c.rule}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
