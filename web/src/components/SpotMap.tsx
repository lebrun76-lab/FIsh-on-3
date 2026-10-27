"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SpotSummary } from "@/lib/summaries";
import type { Rating } from "@/lib/types";
import { RatingBadge, RATING_STYLE } from "./ui";
import { FavButton } from "./FavButton";
import { ratingFor } from "@/lib/call";
import { buildField, sourcesOf, type HeatField } from "@/lib/heat";
import { dayShort, nzTodayISO } from "@/lib/time";
import { IslandMapFrame, useIslandMap } from "./IslandMap";

/** Flat site colours. Marker fills match the list's rating dots (Tailwind 500/400 shades). */
const FILL: Record<Rating, string> = { great: "#10b981", good: "#84cc16", marginal: "#fbbf24", poor: "#f43f5e" };
const short = (n: string) => n.split(" (")[0].split(" / ")[0];
type Part = "" | "am" | "pm";
const PARTS: [Part, string][] = [["", "Day"], ["am", "AM"], ["pm", "PM"]];
/** Dates the forecasts cover, today first (at most 7 for the picker). */
const datesOf = (spots: SpotSummary[]) => [...new Set(spots.flatMap((s) => Object.keys(s.slots).filter((k) => k.length === 10)))].sort().slice(0, 7);

export function SpotMap({ spots, island, favourites, tall, days = 7 }: { spots: SpotSummary[]; island: "North" | "South"; favourites: string[]; tall?: boolean; days?: number }) {
  const m = useIslandMap(island);
  const { size, view, moved, toScreen } = m;
  const cv = useRef<HTMLCanvasElement>(null);
  const dates = useMemo(() => datesOf(spots).slice(0, days), [spots, days]);
  const [date, setDate] = useState<string>(() => dates[0] ?? nzTodayISO());
  const [part, setPart] = useState<Part>("");
  const slot = date + part;
  const has = (k: string) => spots.some((s) => s.island === island && s.coastal && k in s.slots);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { setSel(null); }, [island, size.w, size.h]);

  const inIsland = useMemo(() => spots.filter((s) => s.island === island), [spots, island]);
  const pts = useMemo(() => {
    if (!view) return [];
    return inIsland.map((s) => { const [x, y] = toScreen(s.pt[1], s.pt[0]); const v = s.slots[slot]; return { s, v, r: v == null ? null : ratingFor(v), x, y }; });
  }, [inIsland, view, toScreen, slot]);

  // Shaded sea: one offscreen field per island and slot (built once), then just redrawn on pan and zoom.
  const fields = useMemo(() => new Map<string, HeatField | null>(), [spots]);
  const field = useMemo(() => {
    const k = `${island}|${slot}`;
    if (!fields.has(k)) {
      const src = sourcesOf(spots.filter((s) => s.coastal && s.island === island && s.slots[slot] != null).map((s) => ({ lat: s.pt[0], lon: s.pt[1], v: s.slots[slot] })));
      fields.set(k, buildField(island, src));
    }
    return fields.get(k) ?? null;
  }, [fields, spots, island, slot]);
  useEffect(() => {
    const c = cv.current; if (!c || !view || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    if (!field) return;
    ctx.imageSmoothingEnabled = true;
    ctx.translate(size.w / 2, size.h / 2); ctx.scale(view.s, view.s); ctx.translate(-view.cx, -view.cy);
    ctx.drawImage(field.canvas, field.x0, field.y0, field.w, field.h);
  }, [field, view, size.w, size.h]);

  // Labels only where they fit: saved first, then by score; skip any that would hit a dot or another label.
  const labels = useMemo(() => {
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = pts.map((p) => ({ x0: p.x - 10, y0: p.y - 10, x1: p.x + 10, y1: p.y + 10 }));
    const hit = (b: (typeof placed)[0], skip: number) => placed.some((o, k) => k !== skip && b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    const order = pts.map((p, k) => ({ p, k })).sort((a, b) => Number(favourites.includes(b.p.s.id)) - Number(favourites.includes(a.p.s.id)) || (b.p.v ?? 0) - (a.p.v ?? 0));
    const out = new Map<string, "r" | "l">();
    for (const { p, k } of order) {
      const w = short(p.s.name).length * 6.6 + 10, h = 18;
      for (const side of ["r", "l"] as const) {
        const b = side === "r" ? { x0: p.x + 12, y0: p.y - h / 2, x1: p.x + 12 + w, y1: p.y + h / 2 } : { x0: p.x - 12 - w, y0: p.y - h / 2, x1: p.x - 12, y1: p.y + h / 2 };
        if (b.x0 < 4 || b.x1 > size.w - 4 || b.y0 < 4 || b.y1 > size.h - 4) continue;
        if (hit(b, k)) continue;
        placed.push(b); out.set(p.s.id, side); break;
      }
    }
    return out;
  }, [pts, favourites, size.w, size.h]);

  const selected = sel ? pts.find((p) => p.s.id === sel) : undefined;
  const slotLabel = `${date === dates[0] ? "Today" : dayShort(date + "T12:00:00")}${part === "am" ? " morning" : part === "pm" ? " afternoon" : ""}`;
  const pickSpot = (id: string | null) => setSel(id);
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  const chip = (on: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 disabled:opacity-40 ${on ? "bg-ocean-900 text-white ring-ocean-900" : "bg-white text-slate-700 ring-slate-200"}`;
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Day" className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-0.5">
          {dates.map((d, i) => (
            <button key={d} type="button" aria-pressed={d === date} className={chip(d === date)} disabled={!has(d)}
              onClick={() => { setDate(d); if (part && !has(d + part)) setPart(""); }}>{i === 0 ? "Today" : dayShort(d + "T12:00:00")}</button>
          ))}
        </div>
        <div role="group" aria-label="Time of day" className="flex shrink-0 overflow-hidden rounded-full ring-1 ring-slate-200">
          {PARTS.map(([p, l]) => (
            <button key={l} type="button" aria-pressed={p === part} disabled={!has(date + p)} onClick={() => setPart(p)}
              className={`px-2.5 py-1.5 text-sm font-semibold disabled:opacity-40 ${p === part ? "bg-ocean-900 text-white" : "bg-white text-slate-700"}`}>{l}</button>
          ))}
        </div>
      </div>
      <IslandMapFrame m={m} island={island} onBackground={() => setSel(null)}
        label={`Map of the ${island} Island fishing spots. Drag with two fingers or the mouse to pan. Pinch, or use the plus and minus buttons, to zoom.`}
        className={tall ? "h-[calc(100svh-17rem)] min-h-[440px] max-h-[820px]" : "h-[min(72vh,calc(100svh-21rem))] min-h-[420px]"}
        under={<canvas ref={cv} aria-hidden="true" className="absolute inset-0 block" style={{ width: size.w, height: size.h }} />}>
        {pts.map(({ s, r, v, x, y }) => {
          const fav = favourites.includes(s.id), side = labels.get(s.id), on = sel === s.id;
          return (
            <div key={s.id} className="absolute" style={{ left: x, top: y, zIndex: on ? 3 : fav ? 2 : 1 }}>
              <button type="button"
                onClick={(e) => { e.stopPropagation(); if (moved.current < 6) pickSpot(on ? null : s.id); }}
                aria-label={`${s.name}: ${r ? RATING_STYLE[r].label : "no forecast"} ${slotLabel.toLowerCase()}${fav ? ", saved" : ""}`} aria-expanded={on}
                className="absolute -left-[22px] -top-[22px] flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ocean-700">
                <span className="block rounded-full" style={{ width: on ? 18 : 13, height: on ? 18 : 13, background: r ? FILL[r] : "#cbd5e1", border: "2px solid white", boxShadow: fav ? "0 0 0 2.5px #0b3556" : "0 0 0 1px rgba(15,23,42,.35)" }} />
              </button>
              {side && (
                <span aria-hidden="true" className={`pointer-events-none absolute top-[-9px] whitespace-nowrap rounded px-1 text-[11px] font-semibold leading-[18px] text-slate-800 ${side === "r" ? "left-[12px]" : "right-[12px]"}`} style={{ background: "rgba(255,255,255,.8)" }}>
                  {short(s.name)}
                </span>
              )}
            </div>
          );
        })}
        {selected && (
          <div data-nopan role="dialog" aria-label={selected.s.name} className="absolute inset-x-2 bottom-2 z-20 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">{selected.r && <RatingBadge rating={selected.r} score={selected.v} />}<span className="truncate text-xs text-slate-500">{slotLabel}</span></div>
                <div className="mt-1 break-words font-semibold text-slate-900">{selected.s.name}</div>
                <div className="text-sm text-slate-700">{selected.s.best ?? selected.s.headline}</div>
              </div>
              <FavButton id={selected.s.id} compact />
              <button type="button" onClick={() => pickSpot(null)} aria-label="Close" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 5l10 10M15 5 5 15" /></svg>
              </button>
            </div>
            <Link href={`/spots/${selected.s.id}`} className="mt-3 inline-flex rounded-full bg-ocean-900 px-4 py-2 text-sm font-semibold text-white">Open spot</Link>
          </div>
        )}
      </IslandMapFrame>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-slate-600">
        {(Object.keys(FILL) as Rating[]).map((r) => (
          <span key={r} className="inline-flex items-center gap-1"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FILL[r] }} />{RATING_STYLE[r].label}</span>
        ))}
        <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-white" style={{ boxShadow: "0 0 0 2px #0b3556" }} />Saved</span>
      </div>
      <div className="space-y-0.5 px-1 text-[11px] text-slate-400">
        <p className="font-semibold text-slate-500">Shading blends nearby spot forecasts. Not for navigation.</p>
        <p>Coastline: Natural Earth.</p>
      </div>
    </div>
  );
}
