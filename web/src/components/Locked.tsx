"use client";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
/** Friendly paywall: say what they'd get, offer the honest trial, never nag. */
export function Locked({ title, body, compact = false }: { title: string; body: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-dashed border-ocean-500/40 bg-ocean-100/40 ${compact ? "p-3" : "p-4"}`}>
      <div className="font-semibold text-ocean-900">🔒 {title}</div>
      <p className="text-sm text-slate-600">{body}</p>
      <Link href="/pricing" className="mt-2 inline-block rounded-full bg-ocean-900 px-4 py-1.5 text-sm font-semibold text-white">Try Pro free for {BRAND.trialDays} days</Link>
      <span className="ml-2 text-xs text-slate-500">No card needed</span>
    </div>
  );
}
