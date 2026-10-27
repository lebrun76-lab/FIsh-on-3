/**
 * Responsive SVG sea-temperature map (no client JS needed; renders the same on
 * the server and inside client components). Cells are the engine's 0.5° SST
 * grid; black lines are 1°C isotherms; land from Natural Earth 10 m.
 */
import type { SstMapData } from "@/lib/sst";

// matplotlib RdYlBu_r, same palette as the engine PNG
const STOPS = ["#313695", "#4575b4", "#74add1", "#abd9e9", "#e0f3f8", "#ffffbf", "#fee090", "#fdae61", "#f46d43", "#d73027", "#a50026"];
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function colour(v: number, lo: number, hi: number) {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1))) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(t));
  const a = hex(STOPS[i]), b = hex(STOPS[i + 1]), f = t - i;
  return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f)).join(",")})`;
}

export function SstMap({ m, caption, title, compact = false }: { m: SstMapData; caption: string[]; title: string; compact?: boolean }) {
  const { bbox, step } = m;
  const k = Math.cos((((bbox.north + bbox.south) / 2) * Math.PI) / 180);
  const S = 100;
  const X = (lon: number) => (lon - bbox.west + step / 2) * k * S;
  const Y = (lat: number) => (bbox.north + step / 2 - lat) * S;
  const W = X(bbox.east + step / 2), H = Y(bbox.south - step / 2);
  const [lo, hi] = m.range ?? [8, 20];
  const pts = (r: [number, number][]) => r.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  const fs = Math.max(W, H) / (compact ? 28 : 40);
  const labels = Object.entries(m.isotherms).map(([lev, segs]) => {
    const longest = segs.reduce((a, b) => (b.length > a.length ? b : a), segs[0]);
    const inside = longest.filter(([x, y]) => x > bbox.west && x < bbox.east && y > bbox.south && y < bbox.north);
    const p = inside[Math.floor(inside.length / 2)];
    return p ? { lev, x: X(p[0]), y: Y(p[1]) } : null;
  }).filter(Boolean) as { lev: string; x: number; y: number }[];
  const legend = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  return (
    <figure className="rounded-2xl bg-white p-3 md:p-4 shadow-sm ring-1 ring-slate-100">
      <figcaption className="mb-2">
        <div className="font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500">Model sea-surface temperature · {m.valid_text}</div>
      </figcaption>
      <svg viewBox={`0 0 ${W.toFixed(0)} ${H.toFixed(0)}`} className="mx-auto block h-auto w-full rounded-xl" style={{ maxWidth: `calc(${compact ? 60 : 80}vh * ${(W / H).toFixed(3)})` }} role="img" aria-label={`${title}. ${caption.join(" ")}`}>
        <defs><clipPath id={`sstclip-${title.length}`}><rect width={W} height={H} /></clipPath></defs>
        <g clipPath={`url(#sstclip-${title.length})`}>
        <rect width={W} height={H} fill="#e2e8f0" />
        {m.lats.map((la, i) => m.lons.map((lo_, j) => {
          const v = m.sst[i][j];
          return v === null ? null : <rect key={`${i}-${j}`} x={X(lo_ - step / 2)} y={Y(la + step / 2)} width={step * k * S + 0.6} height={step * S + 0.6} fill={colour(v, lo, hi)}><title>{v}°C</title></rect>;
        }))}
        {Object.entries(m.isotherms).map(([lev, segs]) => segs.map((s, i) => <polyline key={`${lev}-${i}`} points={pts(s)} fill="none" stroke="#0f172a" strokeOpacity={0.55} strokeWidth={fs / 9} />))}
        {m.land.map((r, i) => <polygon key={i} points={pts(r)} fill="#e7e2d6" stroke="#64748b" strokeWidth={fs / 12} />)}
        {labels.map((l) => <text key={l.lev} x={l.x} y={l.y} fontSize={fs * 0.8} textAnchor="middle" dominantBaseline="middle" fill="#0f172a" stroke="white" strokeWidth={fs / 5} paintOrder="stroke">{l.lev}°</text>)}
        {m.focus && (
          <g>
            <circle cx={X(m.focus.lon)} cy={Y(m.focus.lat)} r={fs * 0.55} fill="#0f172a" stroke="white" strokeWidth={fs / 6} />
            <text x={X(m.focus.lon) + fs * 0.9} y={Y(m.focus.lat)} fontSize={fs} dominantBaseline="middle" fill="#0f172a" stroke="white" strokeWidth={fs / 4} paintOrder="stroke" fontWeight={700}>{m.focus.name.split(" (")[0].split(" / ")[0]}</text>
          </g>
        )}
        </g>
      </svg>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500" aria-hidden>
        <span>{lo}°</span>
        <div className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${legend.map((v) => colour(v, lo, hi)).join(",")})` }} />
        <span>{hi}°C</span>
      </div>
      <div className="mt-3 space-y-1 text-sm text-slate-700">{caption.map((c) => <p key={c}>{c}</p>)}</div>
      <p className="mt-2 text-[11px] text-slate-400">{m.caveats.join(" ")} Lines are every 1°C. {m.attribution}</p>
    </figure>
  );
}
