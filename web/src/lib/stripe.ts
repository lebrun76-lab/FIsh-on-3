// Stripe for the prototype, server side only. NO STRIPE ACCOUNT EXISTS YET.
// - STRIPE_SECRET_KEY unset: mock mode. Calls are answered in memory with Stripe-shaped objects,
//   nothing leaves the box. This is what the prototype runs on.
// - STRIPE_SECRET_KEY=sk_test_...: real test-mode calls to api.stripe.com. Live keys are refused here.
// Plain fetch + form encoding (no SDK), so the exact request is visible and testable.
import crypto from "node:crypto";
import { NO_END } from "./pause";

export type StripeMode = "mock" | "test";
export function stripeMode(): StripeMode {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) return "mock";
  if (!/^(sk|rk)_test_/.test(k)) throw new Error("Prototype only takes Stripe test-mode keys (sk_test_...)");
  return "test";
}

/** The parts of a Stripe Subscription we use. */
export interface StripeSubscription {
  id: string; object: "subscription"; customer: string; status: string;
  pause_collection: { behavior: "void" | "keep_as_draft" | "mark_uncollectible"; resumes_at: number | null } | null;
  current_period_end?: number; items?: { data: { current_period_end?: number; price?: { id: string } }[] };
  metadata?: Record<string, string>;
}

/** Form body for subscriptions.update. */
export const pauseParams = (resumesAt: number) => new URLSearchParams({ "pause_collection[behavior]": "void", "pause_collection[resumes_at]": String(resumesAt) }).toString();
export const resumeParams = () => new URLSearchParams({ pause_collection: "" }).toString(); // empty string unsets it

const g = globalThis as unknown as { __mockSubs?: Map<string, StripeSubscription> };
const mockSubs = (g.__mockSubs ??= new Map());
const mockSub = (id: string): StripeSubscription =>
  mockSubs.get(id) ?? { id, object: "subscription", customer: "cus_mock_prototype", status: "active", pause_collection: null, items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, price: { id: "price_mock_pro_monthly" } }] } };

async function updateSubscription(id: string, body: string, idem: string): Promise<StripeSubscription> {
  if (stripeMode() === "mock") {
    const p = new URLSearchParams(body), sub = mockSub(id);
    const next: StripeSubscription = p.has("pause_collection[behavior]")
      ? { ...sub, pause_collection: { behavior: p.get("pause_collection[behavior]") as "void", resumes_at: p.has("pause_collection[resumes_at]") ? Number(p.get("pause_collection[resumes_at]")) : null } }
      : { ...sub, pause_collection: null };
    mockSubs.set(id, next);
    return next;
  }
  const r = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(id)}`, {
    method: "POST", body,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": idem },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Stripe ${r.status}: ${j?.error?.message ?? "error"}`);
  return j as StripeSubscription;
}
export const pauseSubscription = (id: string, resumesAt: number) => updateSubscription(id, pauseParams(resumesAt), `pause-${id}-${resumesAt}`);
export const resumeSubscription = (id: string) => updateSubscription(id, resumeParams(), `resume-${id}-${Date.now()}`);

/**
 * Which subscription the request is for. Production: look up subscriptions.stripe_sub_id for the
 * signed-in user (Supabase session), never an id sent by the browser. The prototype has mock auth
 * only, so it uses one subscription: a mock one, or STRIPE_TEST_SUBSCRIPTION_ID in test mode.
 */
export function subscriptionForRequest(_req: Request): string | null {
  return stripeMode() === "mock" ? "sub_mock_prototype" : process.env.STRIPE_TEST_SUBSCRIPTION_ID ?? null;
}

// ------------------------------------------------------------------ webhooks
export const webhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET ?? (stripeMode() === "mock" ? "whsec_mock_prototype" : null);
const hmac = (secret: string, t: number, payload: string) => crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
/** Stripe-Signature header for a payload (tests and the mock only). */
export const signPayload = (payload: string, secret: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${hmac(secret, t, payload)}`;
/** Stripe's scheme: v1 = HMAC-SHA256(secret, "t.payload"), within 5 minutes. */
export function verifySignature(payload: string, header: string | null, secret: string, now = Date.now(), toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const want = Buffer.from(hmac(secret, t, payload), "hex");
  return parts.filter(([k]) => k === "v1").some(([, v]) => { const got = Buffer.from(v ?? "", "hex"); return got.length === want.length && crypto.timingSafeEqual(got, want); });
}

/** What the webhook writes. subscriptions is keyed by stripe_sub_id; the profile row is found through it. */
export interface SubscriptionSync {
  subscription: { stripe_sub_id: string; stripe_customer_id: string; status: string; price_id: string | null; current_period_end: string | null; paused_until: string | null; pause_behavior: string | null };
  profile: { paused_until: string | null };
}
export function syncFromSubscription(sub: StripeSubscription, deleted = false): SubscriptionSync {
  const pc = deleted ? null : sub.pause_collection;
  const paused_until = pc ? (pc.resumes_at ? new Date(pc.resumes_at * 1000).toISOString() : NO_END) : null;
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end; // moved onto items in newer API versions
  return {
    subscription: { stripe_sub_id: sub.id, stripe_customer_id: sub.customer, status: deleted ? "canceled" : sub.status, price_id: sub.items?.data?.[0]?.price?.id ?? null, current_period_end: end ? new Date(end * 1000).toISOString() : null, paused_until, pause_behavior: pc?.behavior ?? null },
    profile: { paused_until },
  };
}

const gs = globalThis as unknown as { __mockSync?: SubscriptionSync[] };
export const mockSynced = (gs.__mockSync ??= []);
/** Write the sync with the Supabase service role (bypasses RLS), or keep it in memory without Supabase. */
export async function saveSync(s: SubscriptionSync): Promise<"supabase" | "mock"> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { mockSynced.push(s); return "mock"; }
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const r = await fetch(`${url}/rest/v1/subscriptions?stripe_sub_id=eq.${encodeURIComponent(s.subscription.stripe_sub_id)}`, { method: "PATCH", headers: h, body: JSON.stringify({ ...s.subscription, updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error(`subscriptions update ${r.status}`);
  const rows = (await r.json()) as { user_id: string }[];
  for (const row of rows) {
    const p = await fetch(`${url}/rest/v1/profiles?id=eq.${row.user_id}`, { method: "PATCH", headers: h, body: JSON.stringify(s.profile) });
    if (!p.ok) throw new Error(`profiles update ${p.status}`);
  }
  return "supabase";
}
