import { NextResponse } from "next/server";
import { buildForecast, getSpot } from "@/lib/mock";
// GET /api/v1/spots/{id}/forecast?days=7  (MOCK)
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const spot = getSpot(id);
  if (!spot) return NextResponse.json({ error: { code: "spot_not_found", message: `No spot '${id}'` } }, { status: 404 });
  const days = Math.min(16, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 7)));
  return NextResponse.json(buildForecast(spot, days));
}
