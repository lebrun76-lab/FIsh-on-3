import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { authMode, serviceHeaders, serviceRole } from "./config";

/** Server client for route handlers and server components, acting as the signed-in user (RLS applies). */
export async function serverSupabase(): Promise<SupabaseClient | null> {
  if (authMode() !== "supabase") return null;
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* server component: proxy.ts refreshes */ } },
    },
  });
}

/** The signed-in user, checked with Supabase Auth (getUser, not the unverified cookie). Null if signed out or mock. */
export async function sessionUser(): Promise<User | null> {
  const sb = await serverSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

/** subscriptions row for a user, read with the service role. Null without Supabase or no row. */
export async function subscriptionRow(userId: string): Promise<{ stripe_customer_id: string | null; stripe_sub_id: string | null; status: string; trial_end: string | null } | null> {
  const sr = serviceRole();
  if (!sr) return null;
  const r = await fetch(`${sr.url}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id,stripe_sub_id,status,trial_end`, { headers: serviceHeaders(sr.key), cache: "no-store" });
  if (!r.ok) throw new Error(`subscriptions read ${r.status}`);
  return ((await r.json()) as never[])[0] ?? null;
}
