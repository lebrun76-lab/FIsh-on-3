import { Suspense } from "react";
import { AccountView, type AlertPreview } from "@/components/AccountView";
import { SPOTS } from "@/lib/mock";
import { allForecasts } from "@/lib/forecasts";
import { alertCall } from "@/lib/call";
import { alertEmail, welcomeEmail, trialEndingEmail } from "@/lib/emails";
export const metadata = { title: "Account" };
export const revalidate = 1800;
export default async function Account() {
  // Alert previews from the current engine output. For each spot, every window the alert could pick
  // (any time), each with its email; the page then applies the user's fishing times with the same pick rule.
  const alerts: Record<string, AlertPreview> = Object.fromEntries((await allForecasts()).map((f) => {
    const cands = f.windows.flatMap((w) => { const c = alertCall(f, ["any"], Date.now(), (x) => x === w), email = alertEmail(f, c); return email ? [{ start: w.start, end: w.end, score: w.score, email }] : []; });
    return [f.spot.id, { verdictStart: f.verdict.window?.start ?? null, cands }];
  }));
  return <Suspense><AccountView spots={SPOTS.map((s) => ({ id: s.id, name: s.name }))} alerts={alerts} welcome={welcomeEmail()} trial={trialEndingEmail("Sun 8 Nov")} /></Suspense>;
}
