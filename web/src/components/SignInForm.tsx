"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
export function SignInForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/saved";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const done = (e: string, n?: string) => { signIn(e, n); router.push(next); };
  return (
    <div className="mx-auto max-w-sm pt-10 space-y-4">
      <h1 className="text-2xl font-bold text-center">Sign in or create an account</h1>
      <p className="text-center text-sm text-slate-600">Free. Save your spots and get fishing-window alerts.</p>
      <button onClick={() => done("alex@example.com", "Alex")} className="w-full rounded-full bg-white py-3 font-semibold ring-1 ring-slate-300">
        <span className="mr-2 font-bold text-[#4285F4]">G</span>Continue with Google (mock)
      </button>
      <div className="flex items-center gap-3 text-xs text-slate-400"><div className="h-px flex-1 bg-slate-200" />or<div className="h-px flex-1 bg-slate-200" /></div>
      {!sent ? (
        <form onSubmit={(e) => { e.preventDefault(); if (email.includes("@")) setSent(true); }} className="space-y-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-ocean-500" />
          <button className="w-full rounded-full bg-ocean-900 py-3 font-semibold text-white">Email me a sign-in link</button>
        </form>
      ) : (
        <div className="rounded-2xl bg-ocean-100 p-4 text-sm text-ocean-900">
          Check {email} for a sign-in link. <button className="font-semibold underline" onClick={() => done(email)}>Simulate clicking the link</button>
        </div>
      )}
      <p className="text-center text-xs text-slate-400">Prototype: no real account is created. Production: Supabase Auth.</p>
    </div>
  );
}
