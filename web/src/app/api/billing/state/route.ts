import { NextResponse } from "next/server";
import { mockInvoices, mockStateFor, mockSynced } from "@/lib/stripe";
import { mockOutbox } from "@/lib/mailer";
import { authMode, serviceRole } from "@/lib/supabase/config";
// GET /api/billing/state?user_id=... PROTOTYPE ONLY: what the webhook has written, while there is no
// Supabase (in memory). Returns 404 once SUPABASE_URL is set; production reads profiles with RLS.
export async function GET(req: Request) {
  if (serviceRole() || authMode() === "supabase") return NextResponse.json({ error: "not available" }, { status: 404 });
  const userId = new URL(req.url).searchParams.get("user_id");
  const latest = userId ? mockStateFor(userId) : mockSynced.at(-1) ?? null;
  const subId = latest?.subscription.stripe_sub_id;
  return NextResponse.json({ latest, history: mockSynced.filter((s) => s.subscription.stripe_sub_id === subId).map((s) => ({ status: s.subscription.status, plan: s.profile.plan, paused_until: s.profile.paused_until })), invoices: mockInvoices.filter((i) => i.subId === subId), emails: mockOutbox.filter((m) => m.kind === "trial").map(({ to, subject, idempotencyKey }) => ({ to, subject, idempotencyKey })) });
}
