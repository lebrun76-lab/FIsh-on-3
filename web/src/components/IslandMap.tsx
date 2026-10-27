"use client";
// Shared island map base: Natural Earth coastline, one island framed at a time, mouse drag,
// one finger scrolls the page (with a hint), two fingers pan and zoom, plus zoom buttons.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ISLAND_BOUNDS, NZ_LAND_PATH, project } from "@/lib/nzmap";

export type Island = "North" | "South";
export type View = { cx: number; cy: number; s: number }; // map-unit centre, px per map unit
export const SEA = "#EEF3F6", LAND = "#E7DFD0", COAST = "#B9AD97";
const MAX_ZOOM = 6;
type Pt = { x: number; y: number };

function fitView(island: Island, w: number, h: number): View {
  const [west, north, east, south] = ISLAND_BOUNDS[island];
  const [x0, y0] = project(west, north), [x1, y1] = project(east, south);
  // Leave room on the right for the zoom buttons so no dot sits under them.
  const L = 14, R = 60, V = 14;
  const s = Math.min((w - L - R) / (x1 - x0), (h - 2 * V) / (y1 - y0));
  return { cx: (x0 + x1) / 2 + (w / 2 - (L + (w - L - R) / 2)) / s, cy: (y0 + y1) / 2, s };
}

export type IslandMapState = {
  box: RefObject<HTMLDivElement | null>;
  size: { w: number; h: number };
  view: View | null;
  /** Total pointer travel in the current gesture; a tap is under about 6 px. */
  moved: RefObject<number>;
  hint: boolean;
  zoomAt: (factor: number, px?: number, py?: number) => void;
  reset: () => void;
  /** Screen position of a lon/lat inside the box. */
  toScreen: (lon: number, lat: number) => [number, number];
  handlers: { onPointerDown: (e: React.PointerEvent) => void; onPointerMove: (e: React.PointerEvent) => void; onPointerUp: (e: React.PointerEvent) => void; onPointerCancel: (e: React.PointerEvent) => void; onPointerLeave: (e: React.PointerEvent) => void };
};

export function useIslandMap(island: Island): IslandMapState {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const fit = useRef<View | null>(null);
  const ptrs = useRef(new Map<number, Pt>());
  const moved = useRef(0);
  const touch = useRef<Pt[] | null>(null);
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  // Two fingers (or one in fullscreen): the map point under the old midpoint follows the new one, scaled by the spread.
  const panZoom = useCallback((a: Pt[], b: Pt[]) => {
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    const mid = (q: Pt[]) => ({ x: q.reduce((n, p) => n + p.x, 0) / q.length - r.left, y: q.reduce((n, p) => n + p.y, 0) / q.length - r.top });
    const spread = (q: Pt[]) => (q.length > 1 ? Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y) : 0);
    const m0 = mid(a), m1 = mid(b), d0 = spread(a), d1 = spread(b);
    const f = d0 > 0 && d1 > 0 ? d1 / d0 : 1;
    moved.current += Math.abs(m1.x - m0.x) + Math.abs(m1.y - m0.y) + Math.abs(d1 - d0);
    setView((v) => {
      if (!v) return v;
      const mx = v.cx + (m0.x - size.w / 2) / v.s, my = v.cy + (m0.y - size.h / 2) / v.s;
      const f0 = fit.current, s = f0 ? Math.min(Math.max(v.s * f, f0.s), f0.s * MAX_ZOOM) : v.s * f;
      return clamp({ s, cx: mx - (m1.x - size.w / 2) / s, cy: my - (m1.y - size.h / 2) / s });
    });
  }, [clamp, size.w, size.h]);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const full = () => !!document.fullscreenElement && document.fullscreenElement.contains(el);
    const list = (e: TouchEvent) => [...e.touches].slice(0, 2).map((t) => ({ x: t.clientX, y: t.clientY }));
    const onStart = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest("[data-nopan]")) { touch.current = null; return; }
      if (e.touches.length === 1) moved.current = 0;
      touch.current = list(e);
      if (e.touches.length >= 2) { e.preventDefault(); setHint(false); }
    };
    const onTouchMove = (e: TouchEvent) => {
      const prev = touch.current; if (!prev) return;
      const cur = list(e);
      if (cur.length >= 2 || full()) {
        if (e.cancelable) e.preventDefault();
        if (prev.length === cur.length) panZoom(prev, cur);
        touch.current = cur;
        return;
      }
      // One finger: leave it to the page to scroll; just say how to move the map.
      const dx = cur[0].x - prev[0].x, dy = cur[0].y - prev[0].y;
      moved.current = Math.max(moved.current, Math.abs(dx) + Math.abs(dy));
      if (moved.current > 10) {
        setHint(true);
        clearTimeout(hintTimer.current);
        hintTimer.current = setTimeout(() => setHint(false), 1500);
      }
    };
    const onEnd = (e: TouchEvent) => { touch.current = e.touches.length ? list(e) : null; };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onEnd); el.removeEventListener("touchcancel", onEnd);
      clearTimeout(hintTimer.current);
    };
  }, [panZoom]);

  // Mouse and pen: drag pans. Touch is handled above.
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || (e.target as HTMLElement).closest("[data-nopan]")) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId); if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    const dx = cur.x - prev.x, dy = cur.y - prev.y;
    moved.current += Math.abs(dx) + Math.abs(dy);
    setView((v) => (v ? clamp({ ...v, cx: v.cx - dx / v.s, cy: v.cy - dy / v.s }) : v));
    ptrs.current.set(e.pointerId, cur);
  };
  const onUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); };

  const toScreen = useCallback((lon: number, lat: number): [number, number] => {
    if (!view) return [0, 0];
    const [x, y] = project(lon, lat);
    return [(x - view.cx) * view.s + size.w / 2, (y - view.cy) * view.s + size.h / 2];
  }, [view, size.w, size.h]);

  return {
    box, size, view, moved, hint, zoomAt, toScreen,
    reset: () => { if (fit.current) setView(fit.current); },
    handlers: { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp, onPointerLeave: onUp },
  };
}

const ctl = "flex h-11 w-11 items-center justify-center bg-white text-lg font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-ocean-700";

/** The map box itself. `under` sits beneath the coastline (e.g. a shading canvas), `inMap` is drawn in map units
 * on top of the land, and `children` (markers, popups) are positioned in screen pixels with toScreen(). */
export function IslandMapFrame({ m, island, label, className, onBackground, under, inMap, children }: {
  m: IslandMapState; island: Island; label: string; className: string; onBackground?: () => void;
  under?: ReactNode; inMap?: ReactNode; children?: ReactNode;
}) {
  const { box, size, view } = m;
  return (
    <div ref={box} role="region" aria-label={label}
      className={`relative w-full select-none overflow-hidden rounded-2xl ring-1 ring-slate-200 ${className}`}
      style={{ background: SEA, touchAction: "pan-y" }}
      {...m.handlers}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("[data-nopan]") && m.moved.current < 6) onBackground?.(); }}>
      {under}
      {view && (
        <svg width={size.w} height={size.h} className="absolute inset-0 block" aria-hidden="true">
          <g transform={`translate(${size.w / 2} ${size.h / 2}) scale(${view.s}) translate(${-view.cx} ${-view.cy})`}>
            <path d={NZ_LAND_PATH} fill={LAND} stroke={COAST} strokeWidth={1 / view.s} strokeLinejoin="round" />
            {inMap}
          </g>
        </svg>
      )}
      {children}
      <div aria-hidden="true" className={`pointer-events-none absolute inset-0 z-[15] flex items-center justify-center bg-slate-900/25 transition-opacity duration-300 ${m.hint ? "opacity-100" : "opacity-0"}`}>
        <span className="rounded-full bg-slate-900/70 px-3 py-1.5 text-sm font-semibold text-white">Use two fingers to move the map</span>
      </div>
      <div data-nopan className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-xl shadow-sm ring-1 ring-slate-200">
        <button type="button" className={ctl} onClick={() => m.zoomAt(1.6)} aria-label="Zoom in">+</button>
        <button type="button" className={`${ctl} border-t border-slate-200`} onClick={() => m.zoomAt(1 / 1.6)} aria-label="Zoom out">−</button>
        <button type="button" className={`${ctl} border-t border-slate-200`} onClick={m.reset} aria-label={`Show all of the ${island} Island`}>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" /></svg>
        </button>
      </div>
    </div>
  );
}
