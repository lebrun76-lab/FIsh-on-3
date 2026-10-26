"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SpotSummary } from "@/lib/summaries";
import type { Rating } from "@/lib/types";
import { ISLAND_BOUNDS, NZ_LAND_PATH, project } from "@/lib/nzmap";
import { RatingBadge, RATING_STYLE } from "./ui";
import { FavButton } from "./FavButton";

/** Flat site colours. Marker fills match the list's rating dots (Tailwind 500/400 shades). */
const FILL: Record<Rating, string> = { great: "#10b981", good: "#84cc16", marginal: "#fbbf24", poor: "#f43f5e" };
const SEA = "#EEF3F6", LAND = "#E7DFD0", COAST = "#B9AD97";
const MAX_ZOOM = 6;
type View = { cx: number; cy: number; s: number }; // map-unit centre, px per map unit
const short = (n: string) => n.split(" (")[0].split(" / ")[0];

function fitView(island: "North" | "South", w: number, h: number): View {
  const [west, north, east, south] = ISLAND_BOUNDS[island];
  const [x0, y0] = project(west, north), [x1, y1] = project(east, south);
  // Leave room on the right for the zoom buttons so no dot sits under them.
  const L = 14, R = 60, V = 14;
  const s = Math.min((w - L - R) / (x1 - x0), (h - 2 * V) / (y1 - y0));
  return { cx: (x0 + x1) / 2 + (w / 2 - (L + (w - L - R) / 2)) / s, cy: (y0 + y1) / 2, s };
}

export function SpotMap({ spots, island, favourites }: { spots: SpotSummary[]; island: "North" | "South"; favourites: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const fit = useRef<View | null>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);

  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit to the island whenever it or the box size changes.
  useEffect(() => {
    if (!size.w || !size.h) return;
    fit.current = fitView(island, size.w, size.h);
    setView(fit.current);
    setSel(null);
  }, [island, size.w, size.h]);

  const clamp = useCallback((v: View): View => {
    const f = fit.current; if (!f) return v;
    const s = Math.min(Math.max(v.s, f.s), f.s * MAX_ZOOM);
    // Keep the island's framed area under the box: centre can move within the fitted bounds.
    const hw = size.w / 2 / f.s, hh = size.h / 2 / f.s, vw = size.w / 2 / s, vh = size.h / 2 / s;
    const cx = Math.min(Math.max(v.cx, f.cx - hw + vw), f.cx + hw - vw);
    const cy = Math.min(Math.max(v.cy, f.cy - hh + vh), f.cy + hh - vh);
    return { cx, cy, s };
  }, [size.w, size.h]);

  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    setView((v) => {
      if (!v) return v;
      const ax = px ?? size.w / 2, ay = py ?? size.h / 2;
      const mx = v.cx + (ax - size.w / 2) / v.s, my = v.cy + (ay - size.h / 2) / v.s;
      const s = v.s * factor;
      return clamp({ s, cx: mx - (ax - size.w / 2) / s, cy: my - (ay - size.h / 2) / s });
    });
  }, [clamp, size.w, size.h]);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const onWheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-nopan]")) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) moved.current = 0;
  };
  const onMove = (e: React.PointerEvent) => {
    const p = ptrs.current; const prev = p.get(e.pointerId); if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (p.size === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      moved.current += Math.abs(dx) + Math.abs(dy);
      setView((v) => (v ? clamp({ ...v, cx: v.cx - dx / v.s, cy: v.cy - dy / v.s }) : v));
    } else if (p.size === 2) {
      const other = [...p.entries()].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
      const r = box.current!.getBoundingClientRect();
      moved.current += 20;
      if (d0 > 0) zoomAt(d1 / d0, (cur.x + other.x) / 2 - r.left, (cur.y + other.y) / 2 - r.top);
    }
    p.set(e.pointerId, cur);
  };
  const onUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); };

  const inIsland = useMemo(() => spots.filter((s) => s.island === island), [spots, island]);
  const pts = useMemo(() => {
    if (!view) return [];
    return inIsland.map((s) => { const [x, y] = project(s.lon, s.lat); return { s, x: (x - view.cx) * view.s + size.w / 2, y: (y - view.cy) * view.s + size.h / 2 }; });
  }, [inIsland, view, size.w, size.h]);

  // Labels only where they fit: saved first, then by score; skip any that would hit a dot or another label.
  const labels = useMemo(() => {
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = pts.map((p) => ({ x0: p.x - 10, y0: p.y - 10, x1: p.x + 10, y1: p.y + 10 }));
    const hit = (b: (typeof placed)[0], skip: number) => placed.some((o, k) => k !== skip && b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    const order = pts.map((p, k) => ({ p, k })).sort((a, b) => Number(favourites.includes(b.p.s.id)) - Number(favourites.includes(a.p.s.id)) || b.p.s.score - a.p.s.score);
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

  const selected = sel ? inIsland.find((s) => s.id === sel) : undefined;
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  const ctl = "flex h-11 w-11 items-center justify-center bg-white text-lg font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-ocean-700";

  return (
    <div className="min-w-0 space-y-2">
      <div ref={box} role="region" aria-label={`Map of the ${island} Island fishing spots. Drag to pan, pinch or use the plus and minus buttons to zoom.`}
        className="relative h-[min(72vh,calc(100svh-21rem))] min-h-[420px] w-full select-none overflow-hidden rounded-2xl ring-1 ring-slate-200"
        style={{ background: SEA, touchAction: "none" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}
        onClick={(e) => { if (!(e.target as HTMLElement).closest("[data-nopan]") && moved.current < 6) setSel(null); }}>
        {view && (
          <svg width={size.w} height={size.h} className="absolute inset-0 block" aria-hidden="true">
            <g transform={`translate(${size.w / 2} ${size.h / 2}) scale(${view.s}) translate(${-view.cx} ${-view.cy})`}>
              <path d={NZ_LAND_PATH} fill={LAND} stroke={COAST} strokeWidth={1 / view.s} strokeLinejoin="round" />
            </g>
          </svg>
        )}
        {pts.map(({ s, x, y }) => {
          const fav = favourites.includes(s.id), side = labels.get(s.id), on = sel === s.id;
          return (
            <div key={s.id} className="absolute" style={{ left: x, top: y, zIndex: on ? 3 : fav ? 2 : 1 }}>
              <button type="button"
                onClick={(e) => { e.stopPropagation(); if (moved.current < 6) setSel(on ? null : s.id); }}
                aria-label={`${s.name}: ${RATING_STYLE[s.rating].label}${fav ? ", saved" : ""}`} aria-expanded={on}
                className="absolute -left-[22px] -top-[22px] flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ocean-700">
                <span className="block rounded-full" style={{ width: on ? 20 : 16, height: on ? 20 : 16, background: FILL[s.rating], border: "2px solid white", boxShadow: fav ? "0 0 0 2.5px #0b3556" : "0 0 0 1px rgba(15,23,42,.25)" }} />
                {fav && <span aria-hidden="true" className="absolute right-0.5 top-0.5 text-[13px] leading-none text-amber-500" style={{ textShadow: "0 0 2px white, 0 0 2px white" }}>★</span>}
              </button>
              {side && (
                <span aria-hidden="true" className={`pointer-events-none absolute top-[-9px] whitespace-nowrap rounded px-1 text-[11px] font-semibold leading-[18px] text-slate-800 ${side === "r" ? "left-[12px]" : "right-[12px]"}`} style={{ background: "rgba(255,255,255,.8)" }}>
                  {short(s.name)}
                </span>
              )}
            </div>
          );
        })}
        <div data-nopan className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-xl shadow-sm ring-1 ring-slate-200">
          <button type="button" className={ctl} onClick={() => zoomAt(1.6)} aria-label="Zoom in">+</button>
          <button type="button" className={`${ctl} border-t border-slate-200`} onClick={() => zoomAt(1 / 1.6)} aria-label="Zoom out">−</button>
          <button type="button" className={`${ctl} border-t border-slate-200`} onClick={() => fit.current && setView(fit.current)} aria-label={`Show all of the ${island} Island`}>
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" /></svg>
          </button>
        </div>
        {selected && (
          <div data-nopan role="dialog" aria-label={selected.name} className="absolute inset-x-2 bottom-2 z-20 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2"><RatingBadge rating={selected.rating} score={selected.score} /><span className="truncate text-xs text-slate-500">{selected.region}</span></div>
                <div className="mt-1 break-words font-semibold text-slate-900">{selected.name}</div>
                <div className="text-sm text-slate-700">{selected.best ?? selected.headline}</div>
              </div>
              <FavButton id={selected.id} compact />
              <button type="button" onClick={() => setSel(null)} aria-label="Close" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 5l10 10M15 5 5 15" /></svg>
              </button>
            </div>
            <Link href={`/spots/${selected.id}`} className="mt-3 inline-flex rounded-full bg-ocean-900 px-4 py-2 text-sm font-semibold text-white">Open spot</Link>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-slate-600">
        {(Object.keys(FILL) as Rating[]).map((r) => (
          <span key={r} className="inline-flex items-center gap-1"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FILL[r] }} />{RATING_STYLE[r].label}</span>
        ))}
        <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="text-amber-500">★</span>Saved</span>
        <span className="text-slate-400">Tap a dot for the forecast.</span>
      </div>
      <p className="px-1 text-[11px] text-slate-400">Coastline: Natural Earth.</p>
    </div>
  );
}
