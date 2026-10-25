import { NextResponse } from "next/server";
import { buildForecast, getSpot } from "@/lib/mock";
// GET /api/v1/spots/{id}/windows?min_score=6.5  (MOCK) — used by the alerts job
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const spot = getSpot(id);
  if (!spot) return NextResponse.json({ error: { code: "spot_not_found", message: `No spot '${id}'` } }, { status: 404 });
  const min = Number(new URL(req.url).searchParams.get("min_score") ?? 6.5);
  const f = buildForecast(spot, 10);
  return NextResponse.json({ api_version: "1", spot_id: id, generated_at: f.generated_at, windows: f.windows.filter((w) => w.score >= min) });
}
