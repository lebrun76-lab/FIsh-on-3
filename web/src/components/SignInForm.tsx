"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { FishTimesPicker } from "@/components/FishTimesPicker";
import { DEFAULT_FISH_TIMES, type FishTime } from "@/lib/fishtimes";
import { safeNext, safeSpotId, welcomeHref } from "@/lib/onboarding";

export function SignInForm() {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const save = safeSpotId(params.get("save"));
  // Every sign-in goes through /welcome: it saves the spot they tapped, or asks for a home spot if they have none.
  const after = welcomeHref(next, save);
  const real = auth.mode === "supabase";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(params.get("error") === "link" ? "That sign-in link didn't work. It may have expired or been opened in another browser. Ask for a new one." : null);
  const [times, setTimes] = useState<FishTime[]>(DEFAULT_FISH_TIMES);

  // Already signed in (for example back from the email link): carry on.
  useEffect(() => { if (real && auth.ready && auth.user) router.replace(after); }, [real, auth.ready, auth.user, after, router]);

  const mockDone = (e: string, n?: string) => { auth.signIn(e, n, times); router.push(after); };
  const run = async (f: () => Promise<{ error?: string }>, done?: () => void) => {
    setBusy(true); setErr(null);
    const r = await f();
    setBusy(false);
    if (r.error) setErr(r.error); else done?.();
  };
  const google = () => (real ? run(() => auth.signInWithGoogle(times, after)) : mockDone("alex@example.com", "Alex"));
  const sendLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    if (real) run(() => auth.sendEmailLink(email.trim(), times, after), () => setSent(true));
    else setSent(true);
  };
  const verify = (e: React.FormEvent) => { e.preventDefault(); run(() => auth.verifyEmailCode(email.trim(), code)); };

  return (
    <div className="mx-auto max-w-sm pt-10 space-y-4">
      <h1 className="text-2xl font-bold text-center">Sign in or create an account</h1>
      <p className="text-center text-sm text-slate-600">{save ? "Free account, no card needed. We'll save that spot as soon as you're in." : "Free account, no card needed. Save your home spot and its forecast comes up first."}</p>
      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100"><FishTimesPicker value={times} onChange={setTimes} /></div>
      <button onClick={google} disabled={busy} className="w-full rounded-full bg-white py-3 font-semibold ring-1 ring-slate-300 disabled:opacity-60">
        <span className="mr-2 font-bold text-[#4285F4]">G</span>Continue with Google{real ? "" : " (pretend)"}
      </button>
      <div className="flex items-center gap-3 text-xs text-slate-400"><div className="h-px flex-1 bg-slate-200" />or<div className="h-px flex-1 bg-slate-200" /></div>
      {!sent ? (
        <form onSubmit={sendLink} className="space-y-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-ocean-500" />
          <button disabled={busy} className="w-full rounded-full bg-ocean-900 py-3 font-semibold text-white disabled:opacity-60">{busy ? "Sending..." : "Email me a sign-in link"}</button>
        </form>
      ) : real ? (
        <div className="rounded-2xl bg-ocean-100 p-4 text-sm text-ocean-900 space-y-3">
          <p>Check {email} for a sign-in link. Open it in this browser. If the email has a 6-digit code, you can type it here instead.</p>
          <form onSubmit={verify} className="flex gap-2">
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Code" aria-label="Code from the email" className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-ocean-500" />
            <button disabled={busy || code.length < 6} className="rounded-full bg-ocean-900 px-4 py-2 font-semibold text-white disabled:opacity-60">Sign in</button>
          </form>
          <button className="text-xs underline" onClick={() => { setSent(false); setCode(""); }}>Use a different email</button>
        </div>
      ) : (
        <div className="rounded-2xl bg-ocean-100 p-4 text-sm text-ocean-900">
          Check {email} for a sign-in link. <button className="font-semibold underline" onClick={() => mockDone(email)}>Pretend to click the link</button>
        </div>
      )}
      {err && <p role="alert" className="text-center text-sm text-rose-600">{err}</p>}
      {!real && <p className="text-center text-xs text-slate-400">Sign-in is pretend on this copy. Nothing leaves your browser.</p>}
    </div>
  );
}
