import { NextResponse } from "next/server";
import { allSummaries } from "@/lib/summaries";
// GET /api/v1/summaries — one-line verdict per spot (list/map view). MOCK
export function GET() { return NextResponse.json({ api_version: "1", spots: allSummaries() }); }
