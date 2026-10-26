// Called by api/refresh_forecasts.py after it stores a new run in Supabase: drops the cached
// Supabase reads (tag "forecasts") and the ISR pages, so the next visit shows the new forecast,
// then runs the phone alerts (lib/pushjob.ts) against it.
import { revalidatePath, revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import { runPushAlerts } from "@/lib/pushjob";
import { cronAuthError } from "@/lib/cron";

export const dynamic = "force-dynamic";

function run(req: Request) {
  const denied = cronAuthError(req);
  if (denied) return denied;
  revalidateTag("forecasts", { expire: 0 });
  revalidatePath("/", "layout");
  // New forecast in: send phone alerts off it once the response is out (no-op without VAPID keys).
  after(() => runPushAlerts().then((r) => console.log("push alerts", r), (e) => console.error("push alerts failed", (e as Error).message)));
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}

export const GET = run;
export const POST = run;
