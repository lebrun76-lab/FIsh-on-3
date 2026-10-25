import { NextResponse } from "next/server";
import { getForecast } from "@/lib/forecasts";
import { FISHABLE, isNearBest } from "@/lib/call";
// GET /api/v1/spots/{id}/windows?min_score=4.5[&near_best=1]. min_score is an API filter only; it defaults to
// the engine's fishable bar (4.5), which is also the only bar alerts use (src/lib/alerts.ts).
// near_best=1 keeps only windows near the day's best (engine near_best; worked out on older output).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = getForecast(id);
  if (!f) return NextResponse.json({ error: { code: "spot_not_found", message: `No spot '${id}'` } }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const min = Number(q.get("min_score") ?? FISHABLE), near = q.get("near_best") === "1";
  const windows = f.windows.filter((w) => w.score >= min && (!near || isNearBest(f, w))).map((w) => ({ ...w, near_best: isNearBest(f, w) }));
  return NextResponse.json({ api_version: "1", spot_id: id, generated_at: f.generated_at, valid_until: f.valid_until ?? null, engine_version: f.engine_version ?? null, data_status: f.data_status, windows });
}
