"use client";
import Link from "next/link";
import type { RegionCall } from "@/lib/summaries";
import { useAuth, isPaid } from "@/lib/auth";
import { RatingBadge, MockTag } from "./ui";
import { Locked } from "./Locked";
export function CallCard({ c, rank, tactics }: { c: RegionCall; rank?: number; tactics?: boolean }) {
  return (
    <Link href={`/spots/${c.spotId}`} className="block rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <div className="flex items-center justify-between gap-2"><div className="font-semibold">{rank ? `${rank}. ` : ""}{c.region} <span className="text-xs font-normal text-slate-500">· {c.dayLabel}</span>{c.mock && <MockTag />}</div><RatingBadge rating={c.rating} score={c.score} /></div>
      <p className="mt-1 text-slate-800">{c.call}</p>
      {tactics && c.tactics && <p className="mt-1 text-sm text-slate-600">Try: {c.tactics}</p>}
    </Link>
  );
}
export function WhereToGo({ calls }: { calls: RegionCall[] }) {
  const { plan, ready } = useAuth();
  if (!ready) return null;
  const pro = isPaid(plan);
  return (
    <div className="space-y-3">
      {(pro ? calls : calls.slice(0, 1)).map((c, i) => <CallCard key={c.region} c={c} rank={i + 1} tactics={pro} />)}
      {!pro && (
        <>
          <div className="relative space-y-3" aria-hidden>
            {calls.slice(1, 4).map((c, i) => <div key={c.region} className="select-none blur-[3px]"><CallCard c={c} rank={i + 2} /></div>)}
            <div className="absolute inset-0 flex items-center justify-center p-4"><div className="max-w-sm bg-white/95 rounded-2xl shadow"><Locked title={`See all ${calls.length} regions ranked`} body="Every region ranked for today and the next 10 days, with species and tactics for each." /></div></div>
          </div>
        </>
      )}
    </div>
  );
}
