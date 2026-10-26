// Pro subscriptions: Checkout, the Customer portal, and the webhook events that keep the app in step.
// Server side only. Test mode or mock, never live (see stripe.ts).
// Trial: 30 days, no card. If no card is added by the end, Stripe CANCELS the subscription
// (trial_settings.end_behavior.missing_payment_method = "cancel") and the user is back on Free.
// Not "pause": a paused subscription would sit there looking like the winter pause, and Alex's promise
// is "no card, no charge, back to Free". Coming back is a fresh Checkout without another trial.
import crypto from "node:crypto";
import type Stripe from "stripe";
import { BRAND } from "./brand";
import { trialEndingEmail } from "./emails";
import { sendEmail } from "./mailer";
import { getSubscription, mockStateFor, mockSubs, mockSynced, saveInvoice, saveSync, stripeClient, stripeMode, syncFromSubscription, toSub, type StripeSubscription, type SubscriptionSync } from "./stripe";

export const PRICE_LOOKUP_KEYS = { month: "pro_monthly_nzd", year: "pro_yearly_nzd" } as const;
export type Interval = keyof typeof PRICE_LOOKUP_KEYS;
export const isInterval = (x: unknown): x is Interval => x === "month" || x === "year";
export const TRIAL_END_BEHAVIOR = "cancel" as const;
export const PORTAL_CONFIG_APP = "salt-supply-web"; // metadata.app on the portal configuration
const CENTS: Record<Interval, number> = { month: Math.round(BRAND.proPriceNzd * 100), year: Math.round(BRAND.proAnnualNzd * 100) };

/** integration_identifier: a label plus 8 random letters, new per session. */
export const integrationIdentifier = () => `salt_supply_pro_${Array.from(crypto.randomBytes(8), (b) => "abcdefghijklmnopqrstuvwxyz"[b % 26]).join("")}`;

export interface CheckoutInput { interval: Interval; priceId: string; userId: string; email?: string; customerId?: string; hadTrial: boolean; origin: string }
/** The exact Checkout Session params. No payment_method_types (dynamic payment methods), no automatic_tax (no GST registration in Stripe yet). */
export function checkoutParams(i: CheckoutInput): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "subscription",
    currency: "nzd",
    line_items: [{ price: i.priceId, quantity: 1 }],
    client_reference_id: i.userId,
    ...(i.customerId ? { customer: i.customerId } : i.email ? { customer_email: i.email } : {}),
    payment_method_collection: "if_required",
    subscription_data: {
      metadata: { user_id: i.userId, app: PORTAL_CONFIG_APP },
      ...(i.hadTrial ? {} : { trial_period_days: BRAND.trialDays, trial_settings: { end_behavior: { missing_payment_method: TRIAL_END_BEHAVIOR } } }),
    },
    success_url: `${i.origin}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${i.origin}/pricing?checkout=cancelled`,
    integration_identifier: integrationIdentifier(),
  };
}

const gp = globalThis as unknown as { __prices?: Partial<Record<Interval, string>> };
const priceCache = (gp.__prices ??= {});
/** Price id by lookup_key, checked against the chosen NZD amounts so a wrong price fails loudly. */
export async function priceFor(interval: Interval): Promise<string> {
  if (stripeMode() === "mock") return `price_mock_${PRICE_LOOKUP_KEYS[interval]}`;
  if (priceCache[interval]) return priceCache[interval]!;
  const { data } = await stripeClient().prices.list({ lookup_keys: [PRICE_LOOKUP_KEYS[interval]], active: true, limit: 1 });
  const p = data[0];
  if (!p) throw new Error(`No active Stripe price with lookup_key ${PRICE_LOOKUP_KEYS[interval]}`);
  if (p.currency !== "nzd" || p.unit_amount !== CENTS[interval] || p.recurring?.interval !== interval) throw new Error(`Stripe price ${p.id} is not NZ$${CENTS[interval] / 100}/${interval}`);
  return (priceCache[interval] = p.id);
}

/** One trial per person. Prototype: memory, plus (test mode) any earlier Stripe subscription with a trial on the customer.
 *  Production: profiles.trial_ends_at or any past subscription. */
export async function hadTrial(userId: string, customerId?: string): Promise<boolean> {
  if (mockSynced.some((s) => s.subscription.user_id === userId && (s.subscription.trial_end || s.profile.plan !== "free"))) return true;
  if (!customerId || stripeMode() !== "test") return false;
  const subs = await stripeClient().subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  return subs.data.some((s) => s.trial_start != null);
}

/** knownHadTrial: the caller already knows the trial was used (mock sign-in keeps that in the browser). */
export async function createCheckout(i: Omit<CheckoutInput, "priceId" | "hadTrial"> & { knownHadTrial?: boolean }): Promise<{ url: string; id: string; mode: "mock" | "test"; trial: boolean }> {
  // STRIPE_TEST_CUSTOMER_ID: prototype hook so a test-clock customer can go through the real Checkout page.
  const customerId = i.customerId ?? mockStateFor(i.userId)?.subscription.stripe_customer_id ?? (stripeMode() === "test" ? process.env.STRIPE_TEST_CUSTOMER_ID || undefined : undefined);
  const trial = !(i.knownHadTrial || (await hadTrial(i.userId, customerId)));
  const { knownHadTrial: _k, ...rest } = i;
  const params = checkoutParams({ ...rest, customerId, priceId: await priceFor(i.interval), hadTrial: !trial });
  if (stripeMode() === "mock") return { url: `/account?upgraded=1&checkout=mock`, id: "cs_mock_prototype", mode: "mock", trial };
  const s = await stripeClient().checkout.sessions.create(params, { idempotencyKey: `checkout-${i.userId}-${i.interval}-${crypto.randomUUID()}` });
  return { url: s.url!, id: s.id, mode: "test", trial };
}

/** After Checkout: what the session created, for the account page (read only). */
export async function checkoutResult(sessionId: string): Promise<{ plan: string; status: string; trial_end: string | null } | null> {
  if (stripeMode() === "mock") return null;
  const s = await stripeClient().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  if (!s.subscription || typeof s.subscription === "string") return null;
  const sync = syncFromSubscription(toSub(s.subscription));
  return { plan: sync.profile.plan, status: sync.subscription.status, trial_end: sync.subscription.trial_end };
}

/** Customer portal: update card, cancel, invoices. Uses the configuration tagged metadata.app, else the default. */
export async function portalUrl(customerId: string, returnUrl: string): Promise<string> {
  if (stripeMode() === "mock") return `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}portal=mock`;
  const st = stripeClient();
  const configs = await st.billingPortal.configurations.list({ active: true, limit: 100 });
  const configuration = configs.data.find((c) => c.metadata?.app === PORTAL_CONFIG_APP)?.id;
  const s = await st.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl, ...(configuration ? { configuration } : {}) });
  return s.url;
}
export const customerForUser = (userId: string) => mockStateFor(userId)?.subscription.stripe_customer_id ?? process.env.STRIPE_TEST_CUSTOMER_ID ?? null;

// ------------------------------------------------------------------ webhook events
export const HANDLED_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.trial_will_end", "invoice.paid", "invoice.payment_failed"] as const;
export interface StripeEventLike { id: string; type: string; data: { object: Record<string, unknown> } }
export interface WebhookDeps {
  fetchSub: (id: string) => Promise<StripeSubscription | null>;
  customerEmail: (customerId: string) => Promise<{ email: string | null; hasCard: boolean }>;
}
export const defaultDeps = (): WebhookDeps => ({
  fetchSub: getSubscription,
  customerEmail: async (id) => {
    if (stripeMode() === "mock") return { email: `${id}@example.test`, hasCard: false };
    const c = await stripeClient().customers.retrieve(id);
    if (c.deleted) return { email: null, hasCard: false };
    return { email: c.email ?? null, hasCard: !!c.invoice_settings?.default_payment_method };
  },
});
const subIdOf = (x: unknown) => (typeof x === "string" ? x : (x as { id?: string } | null)?.id ?? null);
const nzDay = (sec: number) => new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", weekday: "short", day: "numeric", month: "short" }).format(new Date(sec * 1000)).replace(",", "");
/** invoice -> subscription id (newer API versions: parent.subscription_details.subscription). */
export const invoiceSubId = (inv: Record<string, unknown>) =>
  subIdOf((inv.parent as { subscription_details?: { subscription?: unknown } } | null)?.subscription_details?.subscription) ?? subIdOf(inv.subscription);

export type WebhookResult = { handled: string; saved?: "mock" | "supabase"; sync?: SubscriptionSync; email?: { to: string; subject: string; hasCard: boolean }; ignored?: string; invoice?: string };
export async function handleStripeEvent(event: StripeEventLike, deps: WebhookDeps = defaultDeps()): Promise<WebhookResult> {
  const ctx: { saved?: "mock" | "supabase" } = {};
  const r = await route(event, deps, ctx);
  return { ...r, saved: ctx.saved };
}
async function route(event: StripeEventLike, deps: WebhookDeps, ctx: { saved?: "mock" | "supabase" }): Promise<WebhookResult> {
  const o = event.data.object;
  const save = async (sub: StripeSubscription | null, deleted = false, userId?: string) => {
    if (!sub) return undefined;
    const sync = syncFromSubscription(sub, deleted, userId ?? sub.metadata?.user_id);
    ctx.saved = await saveSync(sync);
    return sync;
  };
  switch (event.type) {
    case "checkout.session.completed": {
      if (o.mode !== "subscription") return { handled: event.type, ignored: "not a subscription checkout" };
      const id = subIdOf(o.subscription);
      const sub = id ? await deps.fetchSub(id) : null;
      return { handled: event.type, sync: await save(sub, false, (o.client_reference_id as string) ?? undefined) };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const evSub = o as unknown as StripeSubscription;
      const fresh = (await deps.fetchSub(evSub.id)) ?? evSub; // re-read: events can arrive out of order
      return { handled: event.type, sync: await save(fresh) };
    }
    case "customer.subscription.deleted":
      return { handled: event.type, sync: await save(o as unknown as StripeSubscription, true) };
    case "customer.subscription.trial_will_end": {
      const sub = o as unknown as StripeSubscription;
      const { email, hasCard: customerCard } = await deps.customerEmail(sub.customer);
      const hasCard = !!sub.default_payment_method || customerCard;
      if (!email || !sub.trial_end) return { handled: event.type, ignored: "no email or trial end" };
      const t = trialEndingEmail(nzDay(sub.trial_end), { hasCard, yearly: sub.items?.data?.[0]?.price?.recurring?.interval === "year" });
      await sendEmail(t, email, `trial-will-end/${sub.id}/${sub.trial_end}`);
      return { handled: event.type, email: { to: email, subject: t.subject, hasCard } };
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subId = invoiceSubId(o);
      if (!subId) return { handled: event.type, ignored: "invoice without a subscription" };
      await saveInvoice(subId, event.type === "invoice.paid" ? "paid" : "payment_failed", String(o.id));
      const sync = await save(await deps.fetchSub(subId)); // status moves (active / past_due) with the invoice
      return { handled: event.type, invoice: event.type === "invoice.paid" ? "paid" : "payment_failed", sync };
    }
    default:
      return { handled: "none", ignored: event.type };
  }
}

/** Mock only: make a trialing subscription as Checkout would, so the mock flow has the same shape. */
export function mockTrialSubscription(userId: string, interval: Interval, now = Date.now()): StripeSubscription {
  const id = `sub_mock_${userId}`;
  const s: StripeSubscription = { id, object: "subscription", customer: "cus_mock_prototype", status: "trialing", pause_collection: null, trial_end: Math.floor(now / 1000) + BRAND.trialDays * 86400, metadata: { user_id: userId }, items: { data: [{ price: { id: `price_mock_${PRICE_LOOKUP_KEYS[interval]}`, lookup_key: PRICE_LOOKUP_KEYS[interval], recurring: { interval } } }] } };
  mockSubs.set(id, s);
  return s;
}
