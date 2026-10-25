import type { Rating } from "@/lib/types";
export const RATING_STYLE: Record<Rating, { label: string; bg: string; text: string; ring: string; dot: string }> = {
  great: { label: "Great", bg: "bg-emerald-600", text: "text-emerald-700", ring: "ring-emerald-200", dot: "bg-emerald-500" },
  good: { label: "Good", bg: "bg-lime-600", text: "text-lime-700", ring: "ring-lime-200", dot: "bg-lime-500" },
  marginal: { label: "So-so", bg: "bg-amber-500", text: "text-amber-700", ring: "ring-amber-200", dot: "bg-amber-400" },
  poor: { label: "Poor", bg: "bg-rose-600", text: "text-rose-700", ring: "ring-rose-200", dot: "bg-rose-500" },
};
export function RatingBadge({ rating, score, size = "sm" }: { rating: Rating; score?: number | null; size?: "sm" | "lg" }) {
  const s = RATING_STYLE[rating];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${s.bg} text-white font-semibold ${size === "lg" ? "px-4 py-1.5 text-base" : "px-2.5 py-0.5 text-xs"}`}>
      {s.label}{score !== undefined && score !== null && <span className="opacity-80 font-normal">{score.toFixed(1)}</span>}
    </span>
  );
}
export function MockBanner() {
  return <div className="bg-yellow-100 text-yellow-900 text-xs text-center py-1 px-2">Prototype · forecasts from Forecast Brain (fishon_engine, local job run) · mock sign-in · no payments</div>;
}
export function MockTag() {
  return <span className="ml-1 rounded bg-yellow-300 px-1.5 py-0.5 text-[10px] font-bold uppercase text-yellow-950" title="Engine output missing for this spot; showing generated mock data">mock fallback</span>;
}

/** Placeholder for a real photo (no stock or generated images). See docs/photo-shot-list.md. */
export function PhotoSlot({ id, subject, ratio, className = "" }: { id: string; subject: string; ratio: "16:9" | "3:2" | "4:3" | "3:1" | "1:1"; className?: string }) {
  const [w, h] = ratio.split(":").map(Number);
  return (
    <div role="img" aria-label={`Photo placeholder: ${subject}`} data-photo-id={id} style={{ aspectRatio: `${w} / ${h}` }}
      className={`flex w-full items-center justify-center rounded-2xl border border-dashed border-slate-400 bg-slate-200 p-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}>
      PHOTO: {subject} ({ratio}) · {id}
    </div>
  );
}
