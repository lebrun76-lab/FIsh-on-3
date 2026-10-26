"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SpotSummary } from "@/lib/summaries";
import type { Rating } from "@/lib/types";
import { ISLAND_BOUNDS, NZ_LAND_PATH, project } from "@/lib/nzmap";
import { RatingBadge, RATING_STYLE } from "./ui";
import { FavButton } from "./FavButton";
import { ratingFor } from "@/lib/call";
import { buildField, sourcesOf, type HeatField } from "@/lib/heat";
import { dayShort, nzTodayISO } from "@/lib/time";

/** Flat site colours. Marker fills match the list's rating dots (Tailwind 500/400 shades). */
const FILL: Record<Rating, string> = { great: "#10b981", good: "#84cc16", marginal: "#fbbf24", poor: "#f43f5e" };
const SEA = "#EEF3F6", LAND = "#E7DFD0", COAST = "#B9AD97";
const MAX_ZOOM = 6;
type View = { cx: number; cy: number; s: number }; // map-unit centre, px per map unit
const short = (n: string) => n.split(" (")[0].split(" / ")[0];
type Part = "" | "am" | "pm";
const PARTS: [Part, string][] = [["", "Day"], ["am", "AM"], ["pm", "PM"]];
/** Dates the forecasts cover, today first (at most 7 for the picker). */
const datesOf = (spots: SpotSummary[]) => [...new Set(spots.flatMap((s) => Object.keys(s.slots).filter((k) => k.length === 10)))].sort().slice(0, 7);

function fitView(island: "North" | "South", w: number, h: number): View {
  const [west, north, east, south] = ISLAND_BOUNDS[island];
  const [x0, y0] = project(west, north), [x1, y1] = project(east, south);
  // Leave room on the right for the zoom buttons so no dot sits under them.
  const L = 14, R = 60, V = 14;
  const s = Math.min((w - L - R) / (x1 - x0), (h - 2 * V) / (y1 - y0));
  return { cx: (x0 + x1) / 2 + (w / 2 - (L + (w - L - R) / 2)) / s, cy: (y0 + y1) / 2, s };
}

export function SpotMap({ spots, island, favourites, tall, days = 7 }: { spots: SpotSummary[]; island: "North" | "South"; favourites: string[]; tall?: boolean; days?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const dates = useMemo(() => datesOf(spots).slice(0, days), [spots, days]);
  const [date, setDate] = useState<string>(() => dates[0] ?? nzTodayISO());
  const [part, setPart] = useState<Part>("");
  const slot = date + part;
  const has = (k: string) => spots.some((s) => s.island === island && s.coastal && k in s.slots);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const fit = useRef<View | null>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  // Touch: one finger scrolls the page (with a brief hint), two fingers pan and zoom the map.
  const touch = useRef<{ x: number; y: number }[] | null>(null);
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

  // Two fingers (or one in fullscreen): the map point under the old midpoint follows the new one, scaled by the spread.
  const panZoom = useCallback((a: { x: number; y: number }[], b: { x: number; y: number }[]) => {
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    const mid = (q: { x: number; y: number }[]) => ({ x: q.reduce((n, p) => n + p.x, 0) / q.length - r.left, y: q.reduce((n, p) => n + p.y, 0) / q.length - r.top });
    const spread = (q: { x: number; y: number }[]) => (q.length > 1 ? Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y) : 0);
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

  const inIsland = useMemo(() => spots.filter((s) => s.island === island), [spots, island]);
  const pts = useMemo(() => {
    if (!view) return [];
    return inIsland.map((s) => { const [x, y] = project(s.pt[1], s.pt[0]); const v = s.slots[slot]; return { s, v, r: v == null ? null : ratingFor(v), x: (x - view.cx) * view.s + size.w / 2, y: (y - view.cy) * view.s + size.h / 2 }; });
  }, [inIsland, view, size.w, size.h, slot]);

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

  const ctl = "flex h-11 w-11 items-center justify-center bg-white text-lg font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-ocean-700";

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
      <div ref={box} role="region" aria-label={`Map of the ${island} Island fishing spots. Drag with two fingers or the mouse to pan. Pinch, or use the plus and minus buttons, to zoom.`}
        className={`relative ${tall ? "h-[calc(100svh-17rem)] min-h-[440px] max-h-[820px]" : "h-[min(72vh,calc(100svh-21rem))] min-h-[420px]"} w-full select-none overflow-hidden rounded-2xl ring-1 ring-slate-200`}
        style={{ background: SEA, touchAction: "pan-y" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}
        onClick={(e) => { if (!(e.target as HTMLElement).closest("[data-nopan]") && moved.current < 6) setSel(null); }}>
        <canvas ref={cv} aria-hidden="true" className="absolute inset-0 block" style={{ width: size.w, height: size.h }} />
        {view && (
          <svg width={size.w} height={size.h} className="absolute inset-0 block" aria-hidden="true">
            <g transform={`translate(${size.w / 2} ${size.h / 2}) scale(${view.s}) translate(${-view.cx} ${-view.cy})`}>
              <path d={NZ_LAND_PATH} fill={LAND} stroke={COAST} strokeWidth={1 / view.s} strokeLinejoin="round" />
            </g>
          </svg>
        )}
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
        <div aria-hidden="true" className={`pointer-events-none absolute inset-0 z-[15] flex items-center justify-center bg-slate-900/25 transition-opacity duration-300 ${hint ? "opacity-100" : "opacity-0"}`}>
          <span className="rounded-full bg-slate-900/70 px-3 py-1.5 text-sm font-semibold text-white">Use two fingers to move the map</span>
        </div>
        <div data-nopan className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-xl shadow-sm ring-1 ring-slate-200">
          <button type="button" className={ctl} onClick={() => zoomAt(1.6)} aria-label="Zoom in">+</button>
          <button type="button" className={`${ctl} border-t border-slate-200`} onClick={() => zoomAt(1 / 1.6)} aria-label="Zoom out">−</button>
          <button type="button" className={`${ctl} border-t border-slate-200`} onClick={() => fit.current && setView(fit.current)} aria-label={`Show all of the ${island} Island`}>
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" /></svg>
          </button>
        </div>
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
      </div>
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
