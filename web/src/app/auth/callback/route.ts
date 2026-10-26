import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
// GET /auth/callback?code=...&next=/account
// Where Supabase sends people back after Google sign-in or the email magic link (PKCE flow):
// swap the one-time code for a session cookie, then go on. Add this URL to Supabase Auth's
// Redirect URLs (see docs/demo-deploy.md).
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/account");
export async function GET(req: Request) {
  const url = new URL(req.url), next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const sb = await serverSupabase();
  if (!sb) return NextResponse.redirect(new URL("/signin", url.origin));
  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL(`/signin?error=link`, url.origin));
}
