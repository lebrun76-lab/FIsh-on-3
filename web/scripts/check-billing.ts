// Pro subscription checks (Stripe Checkout, portal, webhooks). Run: npx tsx scripts/check-billing.ts
// No network: mock mode plus pure functions. Fake key strings only; real keys never appear here.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { BRAND } from "../src/lib/brand";
import { HANDLED_EVENTS, PRICE_LOOKUP_KEYS, TRIAL_END_BEHAVIOR, checkoutParams, handleStripeEvent, invoiceSubId, type StripeEventLike, type WebhookDeps } from "../src/lib/billing";
import { isLiveKey, mockSynced, mockInvoices, planFor, resolveStripeKey, signPayload, syncFromSubscription, webhookSecret, type StripeSubscription } from "../src/lib/stripe";
import { trialEndingEmail, wordsBeforeButton } from "../src/lib/emails";
import { mockOutbox } from "../src/lib/mailer";
import { POST as checkoutRoute } from "../src/app/api/billing/checkout/route";
import { POST as portalRoute } from "../src/app/api/billing/portal/route";
import { POST as webhookRoute } from "../src/app/api/stripe/webhook/route";

for (const k of ["STRIPE_SECRET_KEY", "STRIPE_TEST_SECRET_KEY", "STRIPE_API_KEY", "STRIPE_WEBHOOK_SECRET", "SUPABASE_URL", "RESEND_API_KEY", "STRIPE_TEST_SUBSCRIPTION_ID", "STRIPE_TEST_CUSTOMER_ID"]) delete process.env[k]; // mock mode only
const probs: string[] = [];
const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) probs.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
const throws = (what: string, f: () => unknown, re: RegExp, mustNotContain?: string) => {
  try { f(); probs.push(`${what}: did not throw`); }
  catch (e) { const m = (e as Error).message; if (!re.test(m)) probs.push(`${what}: wrong error "${m}"`); if (mustNotContain && m.includes(mustNotContain)) probs.push(`${what}: error leaks the key value`); }
};

async function main() {
// ---- keys: live keys refused (sk_live_ AND rk_live_), in either variable, even next to a test key
const FAKE = { skLive: "sk_live_FAKEfakeFAKE000", rkLive: "rk_live_FAKEfakeFAKE111", skTest: "sk_test_FAKEfakeFAKE222", rkTest: "rk_test_FAKEfakeFAKE333" };
eq("no key = mock", resolveStripeKey({}).mode, "mock");
throws("sk_live_ refused", () => resolveStripeKey({ STRIPE_SECRET_KEY: FAKE.skLive }), /Refusing the live Stripe key in STRIPE_SECRET_KEY/, FAKE.skLive);
throws("rk_live_ refused", () => resolveStripeKey({ STRIPE_SECRET_KEY: FAKE.rkLive }), /Refusing the live Stripe key in STRIPE_SECRET_KEY/, FAKE.rkLive);
throws("rk_live_ refused with spaces", () => resolveStripeKey({ STRIPE_SECRET_KEY: `  ${FAKE.rkLive}\n` }), /Refusing the live/, FAKE.rkLive);
throws("rk_live_ in STRIPE_TEST_SECRET_KEY refused", () => resolveStripeKey({ STRIPE_TEST_SECRET_KEY: FAKE.rkLive }), /Refusing the live Stripe key in STRIPE_TEST_SECRET_KEY/, FAKE.rkLive);
throws("live key beside a test key still refused", () => resolveStripeKey({ STRIPE_TEST_SECRET_KEY: FAKE.skTest, STRIPE_SECRET_KEY: FAKE.rkLive }), /Refusing the live Stripe key in STRIPE_SECRET_KEY/, FAKE.rkLive);
throws("publishable key refused", () => resolveStripeKey({ STRIPE_SECRET_KEY: "pk_test_FAKE" }), /not a Stripe test-mode secret key/, "pk_test_FAKE");
throws("junk refused", () => resolveStripeKey({ STRIPE_SECRET_KEY: "hello" }), /not a Stripe test-mode secret key/, "hello");
eq("sk_test_ accepted", (({ mode, ...r }) => [mode, "from" in r ? r.from : null])(resolveStripeKey({ STRIPE_SECRET_KEY: FAKE.skTest })), ["test", "STRIPE_SECRET_KEY"]);
eq("rk_test_ accepted", resolveStripeKey({ STRIPE_SECRET_KEY: FAKE.rkTest }).mode, "test");
eq("STRIPE_TEST_SECRET_KEY wins", (resolveStripeKey({ STRIPE_TEST_SECRET_KEY: FAKE.rkTest, STRIPE_SECRET_KEY: FAKE.skTest }) as { from: string }).from, "STRIPE_TEST_SECRET_KEY");
eq("isLiveKey", [FAKE.skLive, FAKE.rkLive, "pk_live_x", FAKE.skTest, FAKE.rkTest].map(isLiveKey), [true, true, true, false, false]);
// the routes fail closed with a live key in the environment
{
  process.env.STRIPE_SECRET_KEY = FAKE.rkLive;
  const r = await checkoutRoute(new Request("http://x/api", { method: "POST", body: JSON.stringify({ interval: "month" }) }));
  const t = await r.text();
  eq("checkout route refuses rk_live_", [r.status, /Refusing the live/.test(t), t.includes(FAKE.rkLive)], [502, true, false]);
  const w = await webhookRoute(new Request("http://x/api", { method: "POST", body: "{}" }));
  eq("webhook refuses rk_live_", [w.status, (await w.text()).includes(FAKE.rkLive)], [500, false]);
  delete process.env.STRIPE_SECRET_KEY;
}

// ---- pricing and Checkout params
eq("pricing", [BRAND.proPriceNzd, BRAND.proAnnualNzd, BRAND.trialDays], [7.99, 49.99, 30]);
eq("lookup keys", PRICE_LOOKUP_KEYS, { month: "pro_monthly_nzd", year: "pro_yearly_nzd" });
eq("trial end behaviour", TRIAL_END_BEHAVIOR, "cancel");
const cp = checkoutParams({ interval: "month", priceId: "price_x", userId: "u1", email: "a@b.nz", hadTrial: false, origin: "http://localhost:3000" });
eq("checkout core", [cp.mode, cp.currency, cp.payment_method_collection, cp.line_items, cp.client_reference_id, cp.customer_email], ["subscription", "nzd", "if_required", [{ price: "price_x", quantity: 1 }], "u1", "a@b.nz"]);
eq("checkout trial", [cp.subscription_data?.trial_period_days, cp.subscription_data?.trial_settings?.end_behavior.missing_payment_method, cp.subscription_data?.metadata?.user_id], [30, "cancel", "u1"]);
eq("checkout no payment_method_types / automatic_tax", ["payment_method_types" in cp, "automatic_tax" in cp], [false, false]);
eq("checkout urls", [cp.success_url, cp.cancel_url], ["http://localhost:3000/account?checkout=success&session_id={CHECKOUT_SESSION_ID}", "http://localhost:3000/pricing?checkout=cancelled"]);
eq("integration_identifier", /^salt_supply_pro_[a-z]{8}$/.test(cp.integration_identifier ?? ""), true);
eq("integration_identifier differs", cp.integration_identifier === checkoutParams({ interval: "month", priceId: "p", userId: "u", hadTrial: false, origin: "o" }).integration_identifier, false);
const again = checkoutParams({ interval: "year", priceId: "price_y", userId: "u1", customerId: "cus_1", email: "a@b.nz", hadTrial: true, origin: "o" });
eq("second time: no trial, existing customer", [again.subscription_data?.trial_period_days, again.subscription_data?.trial_settings, again.customer, again.customer_email], [undefined, undefined, "cus_1", undefined]);

// ---- status -> plan
const sub = (status: string, interval = "month", extra: Partial<StripeSubscription> = {}): StripeSubscription => ({ id: "sub_1", object: "subscription", customer: "cus_1", status, pause_collection: null, trial_end: 1795000000, metadata: { user_id: "u1" }, items: { data: [{ current_period_end: 1795000000, price: { id: `price_${interval}`, lookup_key: interval === "year" ? "pro_yearly_nzd" : "pro_monthly_nzd", recurring: { interval } } }] }, ...extra });
eq("plans", ["trialing", "active", "past_due", "canceled", "paused", "incomplete", "unpaid", "incomplete_expired"].map((s) => planFor(sub(s))), ["trial", "pro", "pro", "free", "free", "free", "free", "free"]);
eq("yearly plan", planFor(sub("active", "year")), "pro_annual");
eq("deleted plan", planFor(sub("active"), true), "free");
const ts = syncFromSubscription(sub("trialing"));
eq("trial sync", [ts.profile.plan, ts.profile.trial_ends_at, ts.subscription.user_id, ts.subscription.trial_end], ["trial", new Date(1795000000e3).toISOString(), "u1", new Date(1795000000e3).toISOString()]);
eq("active sync clears trial_ends_at", syncFromSubscription(sub("active")).profile.trial_ends_at, null);

// ---- webhook events
const store = new Map<string, StripeSubscription>();
const deps = (hasCard = false): WebhookDeps => ({ fetchSub: async (id) => store.get(id) ?? null, customerEmail: async () => ({ email: "kai@example.test", hasCard }) });
const ev = (type: string, object: object): StripeEventLike => ({ id: `evt_${type}`, type, data: { object: object as Record<string, unknown> } });
eq("handled events", [...HANDLED_EVENTS].sort(), ["checkout.session.completed", "customer.subscription.created", "customer.subscription.deleted", "customer.subscription.trial_will_end", "customer.subscription.updated", "invoice.paid", "invoice.payment_failed"]);
{
  store.set("sub_1", sub("trialing", "month", { metadata: {} })); // metadata missing: user comes from the session
  const r = await handleStripeEvent(ev("checkout.session.completed", { id: "cs_1", mode: "subscription", subscription: "sub_1", client_reference_id: "u9" }), deps());
  eq("checkout.session.completed links user", [r.sync?.subscription.user_id, r.sync?.profile.plan], ["u9", "trial"]);
  store.set("sub_1", sub("trialing"));
  eq("subscription.created", (await handleStripeEvent(ev("customer.subscription.created", sub("incomplete")), deps())).sync?.profile.plan, "trial"); // re-read beats the stale event
  store.set("sub_1", sub("active", "year"));
  eq("subscription.updated yearly", (await handleStripeEvent(ev("customer.subscription.updated", sub("active", "year")), deps())).sync?.profile.plan, "pro_annual");
  const d = await handleStripeEvent(ev("customer.subscription.deleted", sub("canceled")), deps());
  eq("subscription.deleted (trial ended, no card)", [d.sync?.profile.plan, d.sync?.subscription.status], ["free", "canceled"]);
  eq("invoice sub id (new API shape)", invoiceSubId({ parent: { subscription_details: { subscription: "sub_1" } } }), "sub_1");
  eq("invoice sub id (old API shape)", invoiceSubId({ subscription: "sub_1" }), "sub_1");
  store.set("sub_1", sub("active"));
  const before = mockInvoices.length;
  const ip = await handleStripeEvent(ev("invoice.paid", { id: "in_1", parent: { subscription_details: { subscription: "sub_1" } } }), deps());
  eq("invoice.paid", [ip.invoice, ip.sync?.profile.plan, mockInvoices.at(-1)], ["paid", "pro", { subId: "sub_1", status: "paid", invoiceId: "in_1" }]);
  store.set("sub_1", sub("past_due"));
  const pf = await handleStripeEvent(ev("invoice.payment_failed", { id: "in_2", parent: { subscription_details: { subscription: "sub_1" } } }), deps());
  eq("invoice.payment_failed keeps Pro while retrying", [pf.invoice, pf.sync?.subscription.status, pf.sync?.profile.plan, mockInvoices.length - before], ["payment_failed", "past_due", "pro", 2]);
  eq("invoice without subscription ignored", (await handleStripeEvent(ev("invoice.paid", { id: "in_3" }), deps())).ignored, "invoice without a subscription");
  const out = mockOutbox.length;
  const tw = await handleStripeEvent(ev("customer.subscription.trial_will_end", sub("trialing")), deps(false));
  eq("trial_will_end email, no card", [tw.email?.to, tw.email?.hasCard, mockOutbox.at(-1)?.kind, mockOutbox.length - out], ["kai@example.test", false, "trial", 1]);
  await handleStripeEvent(ev("customer.subscription.trial_will_end", sub("trialing")), deps(false));
  eq("trial_will_end retry sends once", mockOutbox.length - out, 1);
  const twc = await handleStripeEvent(ev("customer.subscription.trial_will_end", sub("trialing", "month", { id: "sub_2", default_payment_method: "pm_1" })), deps(false));
  eq("trial_will_end with card on the sub", twc.email?.hasCard, true);
  eq("other events ignored", (await handleStripeEvent(ev("payment_intent.succeeded", {}), deps())).ignored, "payment_intent.succeeded");
  eq("one-off checkout ignored", (await handleStripeEvent(ev("checkout.session.completed", { mode: "payment" }), deps())).ignored, "not a subscription checkout");
}

// ---- the trial email: dry, plain, no em dashes or emoji
{
  const m = trialEndingEmail("Sun 8 Nov"), c = trialEndingEmail("Sun 8 Nov", { hasCard: true, yearly: true });
  const all = (t: typeof m) => [t.subject, t.preheader, ...t.body, t.cta.label].join(" ");
  eq("trial email asks for a card", [/trial ends in 3 days/.test(m.body[0]), /Add a card to keep Pro/.test(m.body[0]), m.cta.label, m.cta.href.endsWith("/account?billing=card")], [true, true, "Add a card", true]);
  eq("trial email says what happens without one", /No card, no charge\. You just go back to Free\./.test(m.body[0]), true);
  eq("trial email with card names the price", [/\$49\.99 a year on your card/.test(c.body[0]), c.cta.label], [true, "Your account"]);
  for (const [n, t] of [["no card", m], ["card", c]] as const) {
    if (/—|–/.test(all(t))) probs.push(`trial email ${n}: dash`);
    if (/\p{Extended_Pictographic}/u.test(all(t))) probs.push(`trial email ${n}: emoji`);
    if (/proposed/i.test(all(t))) probs.push(`trial email ${n}: still says proposed`);
    if (wordsBeforeButton(t) > 40) probs.push(`trial email ${n}: ${wordsBeforeButton(t)} words before the button`);
  }
}

// ---- routes (mock mode) and a signed webhook round trip
{
  const post = (h: (r: Request) => Promise<Response>, b: object, headers: Record<string, string> = {}) => h(new Request("http://localhost:3000/api", { method: "POST", body: JSON.stringify(b), headers }));
  const c = await post(checkoutRoute, { interval: "year", user_id: "u5", email: "u5@example.test" }), cj = await c.json();
  eq("checkout route (mock)", [c.status, cj.mode, cj.url, cj.trial], [200, "mock", "/account?upgraded=1&checkout=mock", true]);
  eq("checkout route bad interval", (await post(checkoutRoute, { interval: "week" })).status, 400);
  const p = await post(portalRoute, { user_id: "nobody" }), pj = await p.json();
  eq("portal route (mock)", [p.status, pj.mock, pj.url], [200, true, "http://localhost:3000/account?portal=mock"]);
  const payload = JSON.stringify(ev("customer.subscription.deleted", sub("canceled", "month", { id: "sub_rt", metadata: { user_id: "u5" } })));
  const w = await post(webhookRoute, JSON.parse(payload), { "stripe-signature": signPayload(payload, webhookSecret()!) }), wj = await w.json();
  eq("webhook route deleted", [w.status, wj.plan, wj.status, wj.saved], [200, "free", "canceled", "mock"]);
  eq("webhook state kept", mockSynced.at(-1)?.subscription.user_id, "u5");
  eq("webhook bad signature", (await post(webhookRoute, JSON.parse(payload), { "stripe-signature": "t=1,v1=00" })).status, 400);
}

// ---- copy and repo hygiene
for (const f of ["src/lib/billing.ts", "src/components/PricingCards.tsx", "src/app/pricing/page.tsx", "src/components/AccountView.tsx", "scripts/stripe-env.ts"]) {
  const s = fs.readFileSync(f, "utf8");
  if (/—/.test(s)) probs.push(`${f}: em dash`);
  if (/--live\b/.test(s)) probs.push(`${f}: mentions --live`);
}
if (/PROPOSED|proposed/.test(fs.readFileSync("src/app/pricing/page.tsx", "utf8") + fs.readFileSync("src/components/PricingCards.tsx", "utf8"))) probs.push("pricing still says proposed");
if (/payment_method_types/.test(fs.readFileSync("src/lib/billing.ts", "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "").replace(/"No payment_method_types[^"]*"/g, ""))) probs.push("billing.ts passes payment_method_types");
for (const f of [".env.local", ".env", ".env.production.local"]) {
  try { execFileSync("git", ["check-ignore", "-q", f]); } catch { probs.push(`${f} is not gitignored`); }
}

}
main().then(() => {
console.log(`check-billing: ${probs.length} problems`);
for (const p of probs) console.log("  " + p);
process.exit(probs.length ? 1 : 0);
});
