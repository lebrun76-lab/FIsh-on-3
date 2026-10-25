import { NextResponse } from "next/server";
import { saveSync, syncFromSubscription, verifySignature, webhookSecret, type StripeSubscription } from "@/lib/stripe";
// POST /api/stripe/webhook. Verifies Stripe-Signature on the raw body, then keeps subscriptions and
// profiles.paused_until in step with Stripe (pause, resume, Stripe lifting the pause at resumes_at).
export async function POST(req: Request) {
  const secret = webhookSecret();
  if (!secret) return NextResponse.json({ error: "webhook secret not set" }, { status: 500 });
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "bad signature" }, { status: 400 });
  const event = JSON.parse(raw) as { type: string; data: { object: StripeSubscription } };
  if (event.type !== "customer.subscription.updated" && event.type !== "customer.subscription.deleted") return NextResponse.json({ received: true, ignored: event.type });
  const sync = syncFromSubscription(event.data.object, event.type === "customer.subscription.deleted");
  const saved = await saveSync(sync);
  return NextResponse.json({ received: true, saved, paused_until: sync.profile.paused_until });
}
