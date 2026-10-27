// Map shading: the sea next to every spot shows that spot's own band. Run: npx tsx --test src/lib/heat.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { BLEND_KM, bandAt, heatGrid, kmPerUnit, sourcesOf, type HeatGrid } from "./heat";
import { ratingFor } from "./call";
import { project } from "./nzmap";
import { allSummaries } from "./summaries";

/** Bands at the marker and on a ring around it, close enough that no other spot is nearer. */
function bandsNear(g: HeatGrid, x: number, y: number, ringUnits: number) {
  const out = [bandAt(g, x, y)];
  for (let a = 0; a < 8; a++) out.push(bandAt(g, x + ringUnits * Math.cos((a * Math.PI) / 4), y + ringUnits * Math.sin((a * Math.PI) / 4)));
  return out;
}

test("a spot's own band wins next to it even with a worse neighbour close by (Moeraki and Dunedin)", () => {
  const src = sourcesOf([{ lat: -45.36, lon: 170.86, v: 5 }, { lat: -45.86, lon: 170.72, v: 2 }]); // marginal, poor
  const g = heatGrid("South", src);
  const kpu = kmPerUnit("South");
  for (const b of bandsNear(g, src[0].x, src[0].y, 15 / kpu)) assert.equal(b, "marginal");
  for (const b of bandsNear(g, src[1].x, src[1].y, 15 / kpu)) assert.equal(b, "poor");
});

test("every coastal spot, every day and half-day: the colour by the marker is the marker's band", async () => {
  const spots = (await allSummaries()).filter((s) => s.coastal);
  const slots = [...new Set(spots.flatMap((s) => Object.keys(s.slots)))].sort();
  assert.ok(slots.length > 0, "no forecast slots in the local data");
  const grids = new Map<string, HeatGrid>();
  let checked = 0;
  const bad: string[] = [];
  for (const slot of slots) {
    for (const s of spots.filter((s) => s.slots[slot] != null)) {
      const isl = s.island as "North" | "South";
      const on = spots.filter((o) => o.island === isl && o.slots[slot] != null); // as SpotMap: same island, coastal
      const k = `${isl}|${slot}`;
      if (!grids.has(k)) grids.set(k, heatGrid(isl, sourcesOf(on.map((o) => ({ lat: o.pt[0], lon: o.pt[1], v: o.slots[slot] })))));
      const g = grids.get(k)!;
      const [x, y] = project(s.pt[1], s.pt[0]);
      const others = on.filter((o) => o.id !== s.id).map((o) => { const [ox, oy] = project(o.pt[1], o.pt[0]); return Math.hypot(ox - x, oy - y); });
      const gap = Math.min(...others, Infinity);
      // Up to 5 km out, staying clear of the soft border with the nearest neighbour (plus a grid cell of slack).
      const ring = Math.max(0, Math.min(5 / kmPerUnit(isl), (gap - BLEND_KM / kmPerUnit(isl) - 2 * g.cell) / 2));
      const want = ratingFor(s.slots[slot]);
      const got = bandsNear(g, x, y, ring);
      checked++;
      if (got.some((b) => b !== want)) bad.push(`${slot} ${s.id}: marker ${want}, sea ${got.join("/")}`);
    }
    grids.clear();
  }
  console.log(`checked ${checked} spot-slots across ${slots.length} days and half-days`);
  assert.deepEqual(bad, []);
});

test("no gaps: every bit of sea round each island gets a colour, whatever the distance to a spot", () => {
  for (const [isl, pts] of [["North", [{ lat: -36.8, lon: 174.9, v: 8 }]], ["South", [{ lat: -45.36, lon: 170.86, v: 3 }, { lat: -41.3, lon: 173.4, v: 6.5 }]]] as const) {
    const g = heatGrid(isl, sourcesOf([...pts]));
    for (let k = 3; k < g.px.length; k += 4) assert.ok(g.px[k] > 0, `${isl} cell ${(k - 3) / 4} is blank`);
  }
});
