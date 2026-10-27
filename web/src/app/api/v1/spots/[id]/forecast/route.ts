import { NextResponse } from "next/server";
import { getForecast } from "@/lib/forecasts";
// GET /api/v1/spots/{id}/forecast?days=7 — engine output (data_status tells you if it is a mock fallback)
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = await getForecast(id);
  if (!f) return NextResponse.json({ error: { code: "spot_not_found", message: `No spot '${id}'` } }, { status: 404 });
  const n = Math.min(16, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 7)));
  const days = f.days.slice(0, n);
  const last = days[days.length - 1].date;
  const keep = (t: string) => t.slice(0, 10) <= last;
  return NextResponse.json({ ...f, days, windows: f.windows.filter((w) => keep(w.start)), tides: f.tides.filter((t) => keep(t.time)), hourly: f.hourly.filter((h) => keep(h.time)), tide_series: f.tide_series?.filter((t) => keep(t.time)) });
}
