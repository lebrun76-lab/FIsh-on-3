// Consistency check: every badge must match the call it sits next to.
// Run: npx tsx scripts/check-calls.ts [ISO time ...]
import { allSummaries, regionCalls } from "../src/lib/summaries";
import { allForecasts } from "../src/lib/forecasts";
import { bestCall, ratingFor } from "../src/lib/call";
const real = Date.now;
const times = process.argv.slice(2);
let bad = 0;
for (const t of times.length ? times : [new Date().toISOString()]) {
  const at = Date.parse(t); Date.now = () => at;
  const probs: string[] = [];
  for (const s of allSummaries()) {
    const none = s.headline.startsWith("No fishable");
    if (none ? s.rating !== "poor" : s.rating !== ratingFor(s.score)) probs.push(`summary ${s.id}: ${s.rating} ${s.score} "${s.headline}"`);
  }
  for (const c of regionCalls()) {
    if (c.fishable ? c.rating !== ratingFor(c.score) || !/^(Go|Best chance)/.test(c.call) : c.rating !== "poor" || !c.call.startsWith("Give")) probs.push(`region ${c.region}: ${c.rating} ${c.score} "${c.call}"`);
    if (/[—!]/.test(c.call)) probs.push(`region ${c.region}: punctuation "${c.call}"`);
  }
  for (const f of allForecasts()) for (const sc of ["day", "horizon"] as const) {
    const c = bestCall(f, sc);
    if (c.kind === "window" && (c.rating !== ratingFor(c.score) || c.score < 4.5 || Date.parse(c.end!) <= at)) probs.push(`spot ${f.spot.id} ${sc}: ${c.rating} ${c.score} ${c.headline}`);
  }
  const rc = regionCalls();
  console.log(`${t}: ${probs.length} problems; ${rc.length} regions`);
  if (!times.length || process.env.V) rc.forEach((c) => console.log(`  ${c.region}: ${c.rating} ${c.score} [${c.dayLabel}] ${c.call}`));
  probs.forEach((p) => console.log("  !", p)); bad += probs.length;
}
Date.now = real;
process.exit(bad ? 1 : 0);
