"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authMode } from "./config";

let c: SupabaseClient | null = null;
/** Browser client (session in cookies, PKCE). Null in mock mode. */
export function browserSupabase(): SupabaseClient | null {
  if (authMode() !== "supabase") return null;
  return (c ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!));
}
