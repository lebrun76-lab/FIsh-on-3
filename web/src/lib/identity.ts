// Who a billing request is for. Server side only.
// - Supabase configured: the signed-in user from the session cookie (never an id the browser sends).
//   Signed out gets 401.
// - Mock (no Supabase): the prototype's user_id / email from the request body, as before.
import { authMode, serviceRole } from "./supabase/config";
import { sessionUser, subscriptionRow } from "./supabase/server";
import { mockStateFor, mockSynced, stripeMode } from "./stripe";

export interface BillingUser { userId: string; email?: string; mode: "supabase" | "mock" }
const EMAIL = /^[^@\s]+@[^@\s]+$/;
export async function billingUser(body: unknown): Promise<BillingUser | null> {
  if (authMode() === "supabase") {
    const u = await sessionUser();
    return u ? { userId: u.id, email: u.email ?? undefined, mode: "supabase" } : null;
  }
  const b = (body ?? {}) as { user_id?: unknown; email?: unknown };
  const email = typeof b.email === "string" && EMAIL.test(b.email) ? b.email : undefined;
  const userId = typeof b.user_id === "string" && /^[\w.@+-]{1,80}$/.test(b.user_id) ? b.user_id : email ?? "prototype-user";
  return { userId, email, mode: "mock" };
}

/** Stripe customer for a user: subscriptions.stripe_customer_id with Supabase, else the in-memory sync (or the test-clock hook). */
export async function customerIdFor(userId: string): Promise<string | undefined> {
  if (serviceRole()) return (await subscriptionRow(userId))?.stripe_customer_id ?? undefined;
  return mockStateFor(userId)?.subscription.stripe_customer_id ?? (stripeMode() === "test" ? process.env.STRIPE_TEST_CUSTOMER_ID || undefined : undefined);
}

/** The user's Stripe subscription id for pause / resume. */
export async function subscriptionIdFor(userId: string): Promise<string | null> {
  if (serviceRole()) {
    const row = await subscriptionRow(userId);
    return row?.stripe_sub_id && !["canceled", "incomplete_expired"].includes(row.status) ? row.stripe_sub_id : null;
  }
  if (stripeMode() === "mock") return "sub_mock_prototype";
  if (process.env.STRIPE_TEST_SUBSCRIPTION_ID) return process.env.STRIPE_TEST_SUBSCRIPTION_ID;
  const mine = mockSynced.filter((s) => s.subscription.user_id === userId);
  return [...(mine.length ? mine : mockSynced)].reverse().find((s) => !["canceled", "incomplete_expired"].includes(s.subscription.status))?.subscription.stripe_sub_id ?? null;
}

/** Can this user still start the free trial? One trial per person: false once any earlier subscription had one. */
export async function trialEligible(userId: string): Promise<boolean> {
  const { hadTrial } = await import("./billing");
  if (serviceRole()) {
    const row = await subscriptionRow(userId);
    if (row?.trial_end) return false;
    return !(await hadTrial(userId, row?.stripe_customer_id ?? undefined));
  }
  return !(await hadTrial(userId, await customerIdFor(userId)));
}
