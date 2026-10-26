import { PricingCards } from "@/components/PricingCards";
import { Suspense } from "react";
import { paymentMode } from "@/lib/payment-mode";
export const metadata = { title: "Pricing" };
export default function Pricing() {
  return (
    <div className="pt-6 space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold">Pricing</h1>
      <p className="text-slate-600">Free covers today’s call, tides, the safety check and the rules. Pro is for planning the week ahead. NZD, incl. GST if registered. 30 days free the first time, no card. Cancel any time.</p>
      <Suspense><PricingCards /></Suspense>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
        {[["Why not ads?", "Nobody wants pop-ups at the ramp. Free has no intrusive ads. Pro has none."], ["What happens after the trial?", "Add a card before it ends to keep Pro. If you don’t, you go back to Free. No card, no charge."], ["Is the data any good?", "It runs on the same weather models the forecasters use (ECMWF, GFS, ICON and others). When they disagree, we say so."]].map(([q, a]) => (
          <div key={q} className="rounded-2xl bg-white p-4 ring-1 ring-slate-100"><div className="font-semibold">{q}</div><div className="text-slate-600">{a}</div></div>
        ))}
      </div>
      <p className="text-xs text-slate-500">{paymentMode() === "test" ? "Demo: the button opens Stripe Checkout in test mode. Use card 4242 4242 4242 4242. No real money is taken." : "Demo: payments are switched off on this copy, so the button just turns Pro on for you. No real money is taken."}</p>
    </div>
  );
}
