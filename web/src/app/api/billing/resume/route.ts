import { NextResponse } from "next/server";
import { resumeSubscription, subscriptionForRequest } from "@/lib/stripe";
// POST /api/billing/resume. Clears pause_collection, so billing and alerts start again.
export async function POST(req: Request) {
  const sub = subscriptionForRequest(req);
  if (!sub) return NextResponse.json({ error: { code: "no_subscription", message: "No paid subscription" } }, { status: 404 });
  try {
    const s = await resumeSubscription(sub);
    return NextResponse.json({ paused_until: null, pause_collection: s.pause_collection });
  } catch (e) {
    return NextResponse.json({ error: { code: "stripe_error", message: (e as Error).message } }, { status: 502 });
  }
}
