"use client";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { signupHref } from "@/lib/onboarding";
export function FavButton({ id, compact = false }: { id: string; compact?: boolean }) {
  const { user, favourites, toggleFav, ready } = useAuth();
  const router = useRouter();
  if (!ready) return null;
  const on = favourites.includes(id);
  return (
    <button
      onClick={(e) => { e.preventDefault(); if (!user) return router.push(signupHref(`/spots/${id}`, id)); toggleFav(id); }}
      aria-pressed={on}
      className={`shrink-0 rounded-full ${compact ? "h-9 w-9" : "px-4 py-2 text-sm font-semibold"} ${on ? "bg-amber-400 text-amber-950" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
    >
      {on ? "★" : "☆"}{!compact && (on ? " Saved" : " Save spot")}
    </button>
  );
}
