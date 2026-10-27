import { NextResponse } from "next/server";
import { handleStripeEvent, type StripeEventLike } from "@/lib/billing";
import { verifySignature, webhookSecret } from "@/lib/stripe";
// POST /api/stripe/webhook. Verifies Stripe-Signature on the raw body, then keeps subscriptions and
// profiles (plan, trial_ends_at, paused_until) in step with Stripe. Events: checkout.session.completed,
// customer.subscription.created/updated/deleted/trial_will_end, invoice.paid, invoice.payment_failed.
// Handlers are idempotent (upserts, email idempotency keys), so Stripe's retries are safe.
export async function POST(req: Request) {
  let secret: string | null;
  try { secret = webhookSecret(); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  if (!secret) return NextResponse.json({ error: "webhook secret not set" }, { status: 500 });
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "bad signature" }, { status: 400 });
  const event = JSON.parse(raw) as StripeEventLike;
  try {
    const r = await handleStripeEvent(event);
    if (r.ignored && r.handled === "none") return NextResponse.json({ received: true, ignored: event.type });
    return NextResponse.json({ received: true, type: event.type, saved: r.saved, plan: r.sync?.profile.plan, status: r.sync?.subscription.status, paused_until: r.sync?.profile.paused_until ?? null, email: r.email ? { subject: r.email.subject, hasCard: r.email.hasCard } : undefined, invoice: r.invoice, note: r.ignored });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 }); // 5xx so Stripe retries
  }
}
