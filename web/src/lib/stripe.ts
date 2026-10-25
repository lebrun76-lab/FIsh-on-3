// Stripe for the prototype, server side only. TEST MODE ONLY.
// Keys, in order: STRIPE_TEST_SECRET_KEY (written to the gitignored .env.local from the Stripe CLI's
// test-mode key by scripts/stripe-env.ts), then STRIPE_SECRET_KEY.
// - No key: mock mode. Calls are answered in memory with Stripe-shaped objects, nothing leaves the box.
// - sk_test_/rk_test_: real test-mode calls through the Stripe SDK (one StripeClient, pinned API version).
// - Any live key (sk_live_, rk_live_) in either variable: refused, even if a test key is also set.
//   Key values are never logged or returned; errors name the variable only.
import crypto from "node:crypto";
import Stripe from "stripe";
import { NO_END } from "./pause";

export const STRIPE_API_VERSION = "2026-09-30.endive" as const;
export const KEY_VARS = ["STRIPE_TEST_SECRET_KEY", "STRIPE_SECRET_KEY"] as const;
export type StripeMode = "mock" | "test";
export const isLiveKey = (k: string) => /(^|[^a-z])(sk|rk|pk)_live_/i.test(k.trim());

/** Which key to use. Throws on any live key, or on a value that is not a test secret key. */
export function resolveStripeKey(env: Record<string, string | undefined> = process.env): { mode: "mock" } | { mode: "test"; key: string; from: (typeof KEY_VARS)[number] } {
  for (const name of KEY_VARS) {
    const k = env[name];
    if (k && isLiveKey(k)) throw new Error(`Refusing the live Stripe key in ${name}. This prototype only runs in test mode. Remove it and roll it in the Stripe Dashboard.`);
  }
  for (const name of KEY_VARS) {
    const k = env[name]?.trim();
    if (!k) continue;
    if (!/^(sk|rk)_test_/.test(k)) throw new Error(`${name} is not a Stripe test-mode secret key (sk_test_ or rk_test_)`);
    return { mode: "test", key: k, from: name };
  }
  return { mode: "mock" };
}
export const stripeMode = (): StripeMode => resolveStripeKey().mode;

const gc = globalThis as unknown as { __stripe?: { key: string; client: Stripe } };
/** The one StripeClient for test mode. Throws in mock mode. */
export function stripeClient(): Stripe {
  const r = resolveStripeKey();
  if (r.mode !== "test") throw new Error("Stripe is in mock mode (no test key set)");
  if (gc.__stripe?.key !== r.key) gc.__stripe = { key: r.key, client: new Stripe(r.key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, appInfo: { name: "salt-supply-web", version: "0.1.0" } }) };
  return gc.__stripe.client;
}

/** The parts of a Stripe Subscription we use. */
export interface StripeSubscription {
  id: string; object: "subscription"; customer: string; status: string;
  pause_collection: { behavior: "void" | "keep_as_draft" | "mark_uncollectible"; resumes_at: number | null } | null;
  current_period_end?: number; trial_end?: number | null; cancel_at_period_end?: boolean;
  default_payment_method?: string | null;
  items?: { data: { current_period_end?: number; price?: { id: string; lookup_key?: string | null; recurring?: { interval: string } | null } }[] };
  metadata?: Record<string, string>;
}
/** Stripe.Subscription (expanded or not) to the shape above. */
export function toSub(s: Stripe.Subscription): StripeSubscription {
  const id = (x: string | { id: string } | null | undefined) => (x == null ? null : typeof x === "string" ? x : x.id);
  return {
    id: s.id, object: "subscription", customer: id(s.customer) ?? "", status: s.status,
    pause_collection: s.pause_collection ? { behavior: s.pause_collection.behavior as "void", resumes_at: s.pause_collection.resumes_at ?? null } : null,
    trial_end: s.trial_end, cancel_at_period_end: s.cancel_at_period_end, default_payment_method: id(s.default_payment_method),
    items: { data: s.items.data.map((i) => ({ current_period_end: i.current_period_end, price: { id: i.price.id, lookup_key: i.price.lookup_key, recurring: i.price.recurring ? { interval: i.price.recurring.interval } : null } })) },
    metadata: s.metadata,
  };
}

/** Form body for subscriptions.update (kept as the readable record of what is sent). */
export const pauseParams = (resumesAt: number) => new URLSearchParams({ "pause_collection[behavior]": "void", "pause_collection[resumes_at]": String(resumesAt) }).toString();
export const resumeParams = () => new URLSearchParams({ pause_collection: "" }).toString(); // empty string unsets it

const g = globalThis as unknown as { __mockSubs?: Map<string, StripeSubscription> };
export const mockSubs = (g.__mockSubs ??= new Map());
const mockSub = (id: string): StripeSubscription =>
  mockSubs.get(id) ?? { id, object: "subscription", customer: "cus_mock_prototype", status: "active", pause_collection: null, items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, price: { id: "price_mock_pro_monthly", lookup_key: "pro_monthly_nzd", recurring: { interval: "month" } } }] } };

async function updateSubscription(id: string, body: string, idem: string): Promise<StripeSubscription> {
  const p = new URLSearchParams(body);
  const pc = p.has("pause_collection[behavior]") ? { behavior: p.get("pause_collection[behavior]") as "void", resumes_at: p.has("pause_collection[resumes_at]") ? Number(p.get("pause_collection[resumes_at]")) : null } : null;
  if (stripeMode() === "mock") {
    const next: StripeSubscription = { ...mockSub(id), pause_collection: pc };
    mockSubs.set(id, next);
    return next;
  }
  const s = await stripeClient().subscriptions.update(id, { pause_collection: pc ? { behavior: pc.behavior, ...(pc.resumes_at ? { resumes_at: pc.resumes_at } : {}) } : "" }, { idempotencyKey: idem });
  return toSub(s);
}
export const pauseSubscription = (id: string, resumesAt: number) => updateSubscription(id, pauseParams(resumesAt), `pause-${id}-${resumesAt}`);
export const resumeSubscription = (id: string) => updateSubscription(id, resumeParams(), `resume-${id}-${Date.now()}`);
/** Fresh copy from Stripe (webhooks re-read so out-of-order events cannot roll state back). */
export async function getSubscription(id: string): Promise<StripeSubscription | null> {
  if (stripeMode() === "mock") return mockSubs.get(id) ?? null;
  return toSub(await stripeClient().subscriptions.retrieve(id, { expand: ["items.data.price"] }));
}

/**
 * Which subscription the request is for. Production: look up subscriptions.stripe_sub_id for the
 * signed-in user (Supabase session), never an id sent by the browser. The prototype has mock auth
 * only, so it uses one subscription: the mock one; in test mode STRIPE_TEST_SUBSCRIPTION_ID, else the
 * newest live (not canceled) subscription the webhook has synced into memory.
 */
export function subscriptionForRequest(_req: Request): string | null {
  if (stripeMode() === "mock") return "sub_mock_prototype";
  if (process.env.STRIPE_TEST_SUBSCRIPTION_ID) return process.env.STRIPE_TEST_SUBSCRIPTION_ID;
  return [...mockSynced].reverse().find((s) => !["canceled", "incomplete_expired"].includes(s.subscription.status))?.subscription.stripe_sub_id ?? null;
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

export type BillingPlan = "free" | "trial" | "pro" | "pro_annual";
/** Stripe status to what the user gets. past_due keeps Pro while Stripe retries the card. */
export function planFor(sub: Pick<StripeSubscription, "status" | "items">, deleted = false): BillingPlan {
  if (deleted) return "free";
  if (sub.status === "trialing") return "trial";
  if (sub.status === "active" || sub.status === "past_due") return sub.items?.data?.[0]?.price?.recurring?.interval === "year" ? "pro_annual" : "pro";
  return "free"; // canceled, unpaid, incomplete, incomplete_expired, paused (trial ended without a card)
}

/** What the webhook writes. subscriptions is keyed by user_id when known, else by stripe_sub_id. */
export interface SubscriptionSync {
  subscription: { stripe_sub_id: string; stripe_customer_id: string; status: string; price_id: string | null; current_period_end: string | null; paused_until: string | null; pause_behavior: string | null; trial_end: string | null; user_id?: string };
  profile: { paused_until: string | null; plan: BillingPlan; trial_ends_at: string | null };
}
const iso = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString() : null);
export function syncFromSubscription(sub: StripeSubscription, deleted = false, userId = sub.metadata?.user_id): SubscriptionSync {
  const pc = deleted ? null : sub.pause_collection;
  const paused_until = pc ? (pc.resumes_at ? iso(pc.resumes_at) : NO_END) : null;
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end; // moved onto items in newer API versions
  const plan = planFor(sub, deleted);
  return {
    subscription: { stripe_sub_id: sub.id, stripe_customer_id: sub.customer, status: deleted ? "canceled" : sub.status, price_id: sub.items?.data?.[0]?.price?.id ?? null, current_period_end: iso(end), paused_until, pause_behavior: pc?.behavior ?? null, trial_end: iso(sub.trial_end), ...(userId ? { user_id: userId } : {}) },
    profile: { paused_until, plan, trial_ends_at: plan === "trial" ? iso(sub.trial_end) : null },
  };
}

const gs = globalThis as unknown as { __mockSync?: SubscriptionSync[] };
export const mockSynced = (gs.__mockSync ??= []);
/** Newest synced state for a user, in memory (no Supabase). */
export const mockStateFor = (userId: string) => [...mockSynced].reverse().find((s) => s.subscription.user_id === userId) ?? null;

const sbHeaders = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" });
/** Write the sync with the Supabase service role (bypasses RLS), or keep it in memory without Supabase. */
export async function saveSync(s: SubscriptionSync): Promise<"supabase" | "mock"> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const prevUser = s.subscription.user_id ?? mockSynced.find((x) => x.subscription.stripe_sub_id === s.subscription.stripe_sub_id)?.subscription.user_id;
    mockSynced.push(prevUser ? { ...s, subscription: { ...s.subscription, user_id: prevUser } } : s);
    return "mock";
  }
  const h = sbHeaders(key), row = { ...s.subscription, updated_at: new Date().toISOString() };
  const r = s.subscription.user_id
    ? await fetch(`${url}/rest/v1/subscriptions?on_conflict=user_id`, { method: "POST", headers: { ...h, Prefer: "return=representation,resolution=merge-duplicates" }, body: JSON.stringify(row) })
    : await fetch(`${url}/rest/v1/subscriptions?stripe_sub_id=eq.${encodeURIComponent(s.subscription.stripe_sub_id)}`, { method: "PATCH", headers: h, body: JSON.stringify(row) });
  if (!r.ok) throw new Error(`subscriptions write ${r.status}`);
  const rows = (await r.json()) as { user_id: string }[];
  for (const u of rows) {
    const p = await fetch(`${url}/rest/v1/profiles?id=eq.${u.user_id}`, { method: "PATCH", headers: h, body: JSON.stringify(s.profile) });
    if (!p.ok) throw new Error(`profiles update ${p.status}`);
  }
  return "supabase";
}
/** invoice.paid / invoice.payment_failed: record the latest invoice outcome on the subscription row. */
export async function saveInvoice(subId: string, status: "paid" | "payment_failed", invoiceId: string): Promise<"supabase" | "mock"> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { mockInvoices.push({ subId, status, invoiceId }); return "mock"; }
  const r = await fetch(`${url}/rest/v1/subscriptions?stripe_sub_id=eq.${encodeURIComponent(subId)}`, { method: "PATCH", headers: sbHeaders(key), body: JSON.stringify({ latest_invoice_id: invoiceId, latest_invoice_status: status, updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error(`subscriptions invoice update ${r.status}`);
  return "supabase";
}
const gi = globalThis as unknown as { __mockInv?: { subId: string; status: string; invoiceId: string }[] };
export const mockInvoices = (gi.__mockInv ??= []);
