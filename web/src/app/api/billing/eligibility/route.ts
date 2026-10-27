import { NextResponse } from "next/server";
import { billingUser, trialEligible } from "@/lib/identity";
// POST /api/billing/eligibility {user_id?, email?, had_trial?} (the body is only read with mock sign-in). {trial: boolean}: whether Checkout would include the
// free trial. Same rule as /api/billing/checkout (one trial per person), so the pricing button matches.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  try {
    const u = await billingUser(b);
    if (!u) return NextResponse.json({ trial: true, signedIn: false });
    return NextResponse.json({ trial: !(u.mode === "mock" && b?.had_trial === true) && (await trialEligible(u.userId)), signedIn: true });
  } catch (e) {
    return NextResponse.json({ error: { code: "stripe_error", message: (e as Error).message } }, { status: 502 });
  }
}
