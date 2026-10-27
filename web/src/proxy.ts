// Next 16 Proxy (was middleware). Two jobs, both cheap:
// 1. With Supabase configured, refresh the auth session cookie on each page request (the usual
//    @supabase/ssr pattern). Without Supabase it does nothing for auth.
// 2. In demo mode, send X-Robots-Tag: noindex as well as the robots meta tag and robots.txt.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authMode } from "@/lib/supabase/config";
import { demoMode } from "@/lib/demo";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (authMode() === "supabase") {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    });
    await supabase.auth.getClaims(); // refreshes an expired session; don't put code between createServerClient and this
  }
  if (demoMode()) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  // Pages and API routes only: skip build assets, images, the service worker and public files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|photos/|sst/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
