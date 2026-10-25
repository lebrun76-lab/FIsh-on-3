import { NextResponse } from "next/server";
import { feedbackStore, recordAnswer, recordSpecies } from "@/lib/feedback";
// POST /api/howd-it-go  (form or JSON) token + o=caught|nothing|didnt_go, or token + species[] / skip.
// POST only: the email links open a GET page that shows a confirm button, so link scanners record nothing.
// No sign-in needed; the signed token is the proof. Form posts redirect back to the page (303).
export async function POST(req: Request) {
  const json = (req.headers.get("content-type") ?? "").includes("application/json");
  let token = "", o: unknown, species: unknown, step = "";
  if (json) { const b = await req.json().catch(() => ({})); token = String(b?.token ?? ""); o = b?.o; species = b?.species; step = b?.step ?? (o ? "" : "species"); }
  else {
    const f = await req.formData().catch(() => null);
    token = String(f?.get("token") ?? ""); o = f?.get("o") ?? undefined; step = String(f?.get("step") ?? "");
    species = f?.has("skip") ? [] : f?.getAll("species").map(String) ?? [];
  }
  const store = feedbackStore();
  const r = step === "species" ? await recordSpecies(token, species, store) : await recordAnswer(token, o, store);
  if (json) return r.ok ? NextResponse.json({ outcome: r.row.outcome, species: r.row.species }) : NextResponse.json({ error: r.error }, { status: r.error === "bad" ? 403 : r.error === "bad_outcome" || r.error === "not_caught" ? 400 : 409 });
  const base = new URL(`/howd-it-go/${encodeURIComponent(token)}`, req.url);
  if (!r.ok) base.searchParams.set("error", r.error);
  else base.searchParams.set("saved", r.row.outcome === "caught" && step !== "species" ? "species" : "1");
  return NextResponse.redirect(base, 303);
}
