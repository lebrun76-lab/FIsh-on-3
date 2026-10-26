// Supabase settings. Everything here is optional: with no Supabase env vars the site keeps the
// mock sign-in (localStorage) and the in-memory webhook store, so it still runs anywhere.
//   NEXT_PUBLIC_SUPABASE_URL       project URL (browser and server)
//   NEXT_PUBLIC_SUPABASE_ANON_KEY  anon / publishable key (browser and server, RLS applies)
//   SUPABASE_SERVICE_ROLE_KEY      secret / service role key (server only: Stripe webhook, jobs)
// SUPABASE_URL is still read as an older server-side name for the project URL.
export const publicSupabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
export const publicSupabaseAnonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
/** Real sign-in is on when both public values are set. Inlined at build time in the browser. */
export const authMode = (): "supabase" | "mock" => (publicSupabaseUrl() && publicSupabaseAnonKey() ? "supabase" : "mock");
/** Server side: project URL + service role key for writes that bypass RLS, or null (mock store). */
export function serviceRole(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

/** REST headers for the service key. New sb_secret_ keys go on apikey only (they aren't JWTs and the
 *  gateway rejects them as a Bearer token); the legacy service_role JWT also goes on Authorization. */
export const serviceHeaders = (key: string): Record<string, string> =>
  key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
