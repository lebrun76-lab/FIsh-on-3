import { Suspense } from "react";
import { AccountView } from "@/components/AccountView";
import { SPOTS } from "@/lib/mock";
import { allForecasts } from "@/lib/forecasts";
import { alertCall } from "@/lib/call";
import { alertEmail, welcomeEmail, trialEndingEmail, type EmailTemplate } from "@/lib/emails";
export const metadata = { title: "Account" };
export const revalidate = 1800;
export default function Account() {
  // Email previews built from the current engine output, one alert per spot (null = nothing to send).
  const alerts: Record<string, EmailTemplate | null> = Object.fromEntries(allForecasts().map((f) => [f.spot.id, alertEmail(f, alertCall(f))]));
  return <Suspense><AccountView spots={SPOTS.map((s) => ({ id: s.id, name: s.name }))} alerts={alerts} welcome={welcomeEmail()} trial={trialEndingEmail("Sun 8 Nov")} /></Suspense>;
}
