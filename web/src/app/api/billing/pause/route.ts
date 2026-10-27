import { NextResponse } from "next/server";
import { isPauseMonths, resumesAtFor } from "@/lib/pause";
import { pauseSubscription } from "@/lib/stripe";
import { billingUser, subscriptionIdFor } from "@/lib/identity";
// POST /api/billing/pause {months: 1..6}. Stripe pause_collection {behavior: "void", resumes_at}.
// Returns the new state; the webhook (customer.subscription.updated) is what writes it to the database.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const months = Number(body?.months);
  if (!isPauseMonths(months)) return NextResponse.json({ error: { code: "bad_months", message: "Choose 1 to 6 months" } }, { status: 400 });
  const u = await billingUser(body);
  if (!u) return NextResponse.json({ error: { code: "signed_out", message: "Sign in first" } }, { status: 401 });
  const sub = await subscriptionIdFor(u.userId);
  if (!sub) return NextResponse.json({ error: { code: "no_subscription", message: "No paid subscription" } }, { status: 404 });
  try {
    const s = await pauseSubscription(sub, resumesAtFor(months));
    return NextResponse.json({ paused_until: s.pause_collection?.resumes_at ? new Date(s.pause_collection.resumes_at * 1000).toISOString() : null, pause_collection: s.pause_collection });
  } catch (e) {
    return NextResponse.json({ error: { code: "stripe_error", message: (e as Error).message } }, { status: 502 });
  }
}
