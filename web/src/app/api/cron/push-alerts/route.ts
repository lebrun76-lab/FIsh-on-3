import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron";
import { runPushAlerts } from "@/lib/pushjob";
// GET /api/cron/push-alerts: run the phone alerts by hand (CRON_SECRET). The normal trigger is the
// forecast refresh (api/cron/revalidate-forecasts). Not in vercel.json.
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const denied = cronAuthError(req);
  if (denied) return denied;
  return NextResponse.json(await runPushAlerts());
}
