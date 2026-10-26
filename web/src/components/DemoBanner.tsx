// Replaces the prototype's MockBanner (still in ui.tsx, now unused). Server component.
import { paymentMode } from "@/lib/payment-mode";
import { authMode } from "@/lib/supabase/config";
import { demoMode } from "@/lib/demo";

export const DEMO_TEST_MODE_TEXT = "Demo. Payments are in test mode: use card 4242 4242 4242 4242, any future date, any CVC. No real money is taken.";

export function demoBannerText(): string {
  const pay = paymentMode();
  const text = pay === "test" ? DEMO_TEST_MODE_TEXT
    : pay === "refused" ? "Demo. Payments are switched off because a live Stripe key was set and refused. No real money is taken."
    : "Demo. Payments are switched off on this copy. No real money is taken.";
  return authMode() === "mock" ? `${text} Sign-in is pretend on this copy.` : text;
}

export function DemoBanner() {
  if (!demoMode()) return null;
  return <div role="note" className="bg-yellow-100 text-yellow-900 text-xs text-center py-1 px-2">{demoBannerText()}</div>;
}
