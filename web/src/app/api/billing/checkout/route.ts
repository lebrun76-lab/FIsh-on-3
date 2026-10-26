import { NextResponse } from "next/server";
import { createCheckout, isInterval } from "@/lib/billing";
import { billingUser, customerIdFor } from "@/lib/identity";
// POST /api/billing/checkout {interval: "month"|"year"}. Returns {url}: Stripe Checkout
// (subscription, NZD, 30-day no-card trial for first-timers) in test mode, or the mock account page.
// With Supabase the user id and email come from the session; without it (mock) from the body.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const interval = b?.interval ?? "month";
  if (!isInterval(interval)) return NextResponse.json({ error: { code: "bad_interval", message: "month or year" } }, { status: 400 });
  try {
    const u = await billingUser(b);
    if (!u) return NextResponse.json({ error: { code: "signed_out", message: "Sign in first" } }, { status: 401 });
    const r = await createCheckout({ interval, userId: u.userId, email: u.email, customerId: await customerIdFor(u.userId), knownHadTrial: u.mode === "mock" && b?.had_trial === true, origin: new URL(req.url).origin });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: { code: "stripe_error", message: (e as Error).message } }, { status: 502 });
  }
}
