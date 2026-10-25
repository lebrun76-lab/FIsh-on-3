import Link from "next/link";
import type { SpotSummary } from "@/lib/summaries";
import { RatingBadge, MockTag } from "./ui";
import { FavButton } from "./FavButton";
export function SpotCard({ s }: { s: SpotSummary }) {
  return (
    <Link href={`/spots/${s.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 hover:ring-ocean-500 transition">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><RatingBadge rating={s.rating} score={s.score} /><span className="text-xs text-slate-500 truncate">{s.region}{s.coastal ? "" : " · freshwater"}</span>{s.mock && <MockTag />}</div>
        <div className="mt-1 font-semibold text-slate-900 truncate">{s.name}</div>
        <div className="text-sm text-slate-600 truncate">{s.headline}</div>
      </div>
      <FavButton id={s.id} compact />
    </Link>
  );
}
