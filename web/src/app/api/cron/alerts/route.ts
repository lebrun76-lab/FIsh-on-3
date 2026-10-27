import { cronAuthError, notScheduled } from "@/lib/cron";
// GET /api/cron/alerts: Vercel Cron target. Not in vercel.json yet, so it never runs on its own.
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return cronAuthError(req) ?? notScheduled("alerts", "src/lib/alerts.ts");
}
