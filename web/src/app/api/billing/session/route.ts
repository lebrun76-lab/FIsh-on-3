import { NextResponse } from "next/server";
import { checkoutResult } from "@/lib/billing";
// GET /api/billing/session?id=cs_... After Checkout: the plan it started (read only, for the account page).
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^cs_(test|mock)_\w+$/.test(id)) return NextResponse.json({ error: { code: "bad_session" } }, { status: 400 });
  try { return NextResponse.json((await checkoutResult(id)) ?? { plan: null }); }
  catch (e) { return NextResponse.json({ error: { code: "stripe_error", message: (e as Error).message } }, { status: 502 }); }
}
