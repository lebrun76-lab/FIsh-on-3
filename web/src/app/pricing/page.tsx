import { PricingCards } from "@/components/PricingCards";
import { Suspense } from "react";
export default function Pricing() {
  return (
    <div className="pt-6 space-y-4">
      <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-900">PROPOSED pricing — from market research, not yet approved</span>
      <h1 className="text-2xl md:text-3xl font-bold">Simple, honest pricing</h1>
      <p className="text-slate-600">Free covers today’s call, tides, safety and all the rules. Pro is for planning the week. Prices in NZD, incl. GST if registered. Cancel any time.</p>
      <Suspense><PricingCards /></Suspense>
      <div className="grid gap-3 md:grid-cols-3 text-sm">
        {[["Why not ads?", "Pop-ups at the boat ramp are the worst. Free has no intrusive ads; Pro has none at all."], ["What happens after the trial?", "You go back to Free. We don’t ask for a card, so we can’t surprise-charge you."], ["Is the data any good?", "We blend wind, swell, tide and sea temperature and tell you how confident we are each day."]].map(([q, a]) => (
          <div key={q} className="rounded-2xl bg-white p-4 ring-1 ring-slate-100"><div className="font-semibold">{q}</div><div className="text-slate-600">{a}</div></div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Prototype: the trial button flips a mock flag. Production: trial tracked in Supabase (no card), then Stripe Checkout + Customer Portal to subscribe.</p>
    </div>
  );
}
