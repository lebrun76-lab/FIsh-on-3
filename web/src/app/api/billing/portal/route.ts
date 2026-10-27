import { NextResponse } from "next/server";
import { portalUrl } from "@/lib/billing";
import { billingUser, customerIdFor } from "@/lib/identity";
// POST /api/billing/portal. Returns {url} for the Stripe Customer portal (card, cancel, invoices).
// The customer is subscriptions.stripe_customer_id for the signed-in user (Supabase), or the mock store.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const back = `${new URL(req.url).origin}/account`;
  try {
    const u = await billingUser(b);
    if (!u) return NextResponse.json({ error: { code: "signed_out", message: "Sign in first" } }, { status: 401 });
    const customer = await customerIdFor(u.userId);
    if (!customer) {
      if (u.mode === "supabase") return NextResponse.json({ error: { code: "no_customer", message: "No billing account yet" } }, { status: 404 });
      return NextResponse.json({ url: await portalUrl("cus_mock_prototype", back).catch(() => back), mock: true });
    }
    return NextResponse.json({ url: await portalUrl(customer, back) });
  } catch (e) {
    return NextResponse.json({ error: { code: "stripe_error", message: (e as Error).message } }, { status: 502 });
  }
}
