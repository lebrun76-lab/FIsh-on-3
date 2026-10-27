import { NextResponse } from "next/server";
import { resumeSubscription } from "@/lib/stripe";
import { billingUser, subscriptionIdFor } from "@/lib/identity";
// POST /api/billing/resume. Clears pause_collection, so billing and alerts start again.
export async function POST(req: Request) {
  const u = await billingUser(await req.json().catch(() => ({})));
  if (!u) return NextResponse.json({ error: { code: "signed_out", message: "Sign in first" } }, { status: 401 });
  const sub = await subscriptionIdFor(u.userId);
  if (!sub) return NextResponse.json({ error: { code: "no_subscription", message: "No paid subscription" } }, { status: 404 });
  try {
    const s = await resumeSubscription(sub);
    return NextResponse.json({ paused_until: null, pause_collection: s.pause_collection });
  } catch (e) {
    return NextResponse.json({ error: { code: "stripe_error", message: (e as Error).message } }, { status: 502 });
  }
}
