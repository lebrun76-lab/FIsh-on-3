import { NextResponse } from "next/server";
import { createCheckout, isInterval } from "@/lib/billing";
// POST /api/billing/checkout {interval: "month"|"year", user_id, email}. Returns {url}: Stripe Checkout
// (subscription, NZD, 30-day no-card trial) in test mode, or the mock account page.
// Production: user id and email come from the Supabase session, not the request body.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const interval = b?.interval ?? "month";
  if (!isInterval(interval)) return NextResponse.json({ error: { code: "bad_interval", message: "month or year" } }, { status: 400 });
  const email = typeof b?.email === "string" && /^[^@\s]+@[^@\s]+$/.test(b.email) ? b.email : undefined;
  const userId = typeof b?.user_id === "string" && /^[\w.@+-]{1,80}$/.test(b.user_id) ? b.user_id : email ?? "prototype-user";
  try {
    const r = await createCheckout({ interval, userId, email, origin: new URL(req.url).origin });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: { code: "stripe_error", message: (e as Error).message } }, { status: 502 });
  }
}
