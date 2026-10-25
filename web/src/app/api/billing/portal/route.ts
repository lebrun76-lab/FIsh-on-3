import { NextResponse } from "next/server";
import { customerForUser, portalUrl } from "@/lib/billing";
// POST /api/billing/portal {user_id}. Returns {url} for the Stripe Customer portal (card, cancel, invoices).
// Production: the customer comes from subscriptions.stripe_customer_id for the signed-in user.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const userId = typeof b?.user_id === "string" ? b.user_id : "prototype-user";
  const back = `${new URL(req.url).origin}/account`;
  try {
    const customer = customerForUser(userId);
    if (!customer) return NextResponse.json({ url: await portalUrl("cus_mock_prototype", back).catch(() => back), mock: true });
    return NextResponse.json({ url: await portalUrl(customer, back) });
  } catch (e) {
    return NextResponse.json({ error: { code: "stripe_error", message: (e as Error).message } }, { status: 502 });
  }
}
