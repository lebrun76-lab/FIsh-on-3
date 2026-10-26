"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Photo } from "@/lib/photos";

const INTERVAL_MS = 6500;

/** Home hero: slow crossfade through a few photos. Slide 1 is server-rendered and preloaded;
 * the rest mount after first paint. No auto-rotation with prefers-reduced-motion, while the tab is
 * hidden, or while the user is hovering or focused inside it. Captions are stacked in one grid cell
 * so the tallest caption sets the height and nothing shifts. */
export function HeroRotator({ slides, sizes }: { slides: Photo[]; sizes: string }) {
  const [i, setI] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [held, setHeld] = useState(false); // hover or focus inside
  const [paused, setPaused] = useState(false); // user pressed pause
  const [loaded, setLoaded] = useState<boolean[]>(() => slides.map((_, k) => k === 0));
  const [tick, setTick] = useState(0); // bumps to restart the timer after manual moves
  const touchX = useRef<number | null>(null);
  const n = slides.length;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => setReduced(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    const onVis = () => setHidden(document.visibilityState === "hidden");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    // Mount the other slides only after first paint, so slide 1 owns the LCP.
    let idle: number | undefined;
    const raf = requestAnimationFrame(() => { idle = window.setTimeout(() => setMounted(true), 300); });
    return () => { mq.removeEventListener("change", onMq); document.removeEventListener("visibilitychange", onVis); cancelAnimationFrame(raf); if (idle) clearTimeout(idle); };
  }, []);

  const go = useCallback((k: number) => { setI(((k % n) + n) % n); setTick((t) => t + 1); }, [n]);

  const auto = !reduced && !hidden && !held && !paused && n > 1;
  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => {
      setI((cur) => { const nx = (cur + 1) % n; return loaded[nx] ? nx : cur; });
      setTick((x) => x + 1);
    }, INTERVAL_MS);
    return () => clearTimeout(t);
  }, [auto, i, tick, n, loaded]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
  };

  const btn = "inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200/70 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ocean-700";

  return (
    <section aria-roledescription="carousel" aria-label="Fishing spots around New Zealand" onKeyDown={onKey}
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHeld(false); }}
      className="min-w-0">
      <div className="relative w-full overflow-hidden rounded-2xl bg-slate-200" style={{ aspectRatio: "3 / 2" }}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { const s = touchX.current; touchX.current = null; if (s === null) return; const dx = e.changedTouches[0].clientX - s; if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1); }}>
        {slides.map((p, k) => (k === 0 || mounted) && (
          <div key={p.src} role="group" aria-roledescription="slide" aria-label={`${k + 1} of ${n}: ${p.place}`} aria-hidden={k !== i}
            className={`absolute inset-0 ${reduced ? "" : "transition-opacity duration-1000 ease-in-out"} ${k === i ? "opacity-100" : "opacity-0"}`}>
            <Image src={p.src} alt={p.alt} fill sizes={sizes} preload={k === 0} loading={k === 0 ? "eager" : "lazy"}
              onLoad={() => setLoaded((l) => (l[k] ? l : l.map((v, j) => (j === k ? true : v))))}
              className="object-cover" style={p.position ? { objectPosition: p.position } : undefined} />
          </div>
        ))}
      </div>
      <div className="mt-1 grid text-xs text-slate-500" aria-live={auto ? "off" : "polite"}>
        {slides.map((p, k) => (
          <p key={p.src} className={`[grid-area:1/1] ${k === i ? "" : "invisible"}`} aria-hidden={k !== i}>
            {p.place}
            {p.credit && <span className="text-slate-400"> · Photo: <a href={p.credit.sourceUrl} tabIndex={k === i ? 0 : -1} className="hover:underline" rel="noopener noreferrer" target="_blank">{p.credit.author}</a>, <a href={p.credit.licenceUrl} tabIndex={k === i ? 0 : -1} className="hover:underline" rel="license noopener noreferrer" target="_blank">{p.credit.licence}</a>, via Wikimedia Commons</span>}
          </p>
        ))}
      </div>
      {n > 1 && (
        <div className="mt-1 flex items-center justify-center gap-0.5">
          <button type="button" className={btn} onClick={() => go(i - 1)} aria-label="Previous photo">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.5 4.5 7 10l5.5 5.5" /></svg>
          </button>
          {slides.map((p, k) => (
            <button key={p.src} type="button" onClick={() => go(k)} aria-label={`Photo ${k + 1} of ${n}: ${p.place}`} aria-current={k === i ? "true" : undefined}
              className="inline-flex h-6 w-5 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ocean-700">
              <span aria-hidden="true" className={`block h-1.5 w-1.5 rounded-full ${k === i ? "bg-ocean-900" : "bg-slate-300"}`} />
            </button>
          ))}
          <button type="button" className={btn} onClick={() => go(i + 1)} aria-label="Next photo">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7.5 4.5 13 10l-5.5 5.5" /></svg>
          </button>
          {!reduced && (
            <button type="button" className={btn} onClick={() => setPaused((v) => !v)} aria-label={paused ? "Play slideshow" : "Pause slideshow"} aria-pressed={paused}>
              {paused
                ? <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor"><path d="M6 4l10 6-10 6z" /></svg>
                : <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor"><path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" /></svg>}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
