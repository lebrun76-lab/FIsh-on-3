import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { serverSupabase } from "@/lib/supabase/server";
// GET /auth/confirm?token_hash=...&type=email&next=/account
// For an email template that links here with {{ .TokenHash }} instead of {{ .ConfirmationURL }}.
// Works when the link is opened in a different browser from the one that asked for it (the
// default PKCE link in /auth/callback needs the same browser). Optional: see docs/demo-deploy.md.
const TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "recovery", "invite", "email_change"];
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/account");
export async function GET(req: Request) {
  const url = new URL(req.url), next = safeNext(url.searchParams.get("next"));
  const token_hash = url.searchParams.get("token_hash"), type = url.searchParams.get("type") as EmailOtpType | null;
  const sb = await serverSupabase();
  if (!sb) return NextResponse.redirect(new URL("/signin", url.origin));
  if (token_hash && type && TYPES.includes(type)) {
    const { error } = await sb.auth.verifyOtp({ token_hash, type });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL(`/signin?error=link`, url.origin));
}
