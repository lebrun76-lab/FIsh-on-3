import { NextResponse } from "next/server";
import { SPOTS } from "@/lib/mock";
// GET /api/v1/spots?q=&island=  (static catalog, ids match fishon_engine SPOTS)
export function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").toLowerCase();
  const island = u.searchParams.get("island");
  const spots = SPOTS.filter((s) => (!q || `${s.name} ${s.region} ${s.species.join(" ")}`.toLowerCase().includes(q)) && (!island || s.island === island));
  return NextResponse.json({ api_version: "1", spots });
}
