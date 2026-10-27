// Phone alert rule + message. Run: npx tsx --test src/lib/push.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { planAlerts, planUserPush, inQuiet, PUSH_RULE, EMAIL_RULE, sentRows, type AlertAccount, type SentAlert } from "./alerts";
import { pushMessage } from "./push";
import type { FishingWindow, SpotForecast } from "./types";

// Thu 29 Oct 2026, 10am NZDT = 21:00 UTC Wed 28th. Alerts look at Fri 30th and Sat 31st.
const NOW = Date.parse("2026-10-28T21:00:00Z");
const win = (date: string, from: number, to: number, score: number, extra: Partial<FishingWindow> = {}): FishingWindow => ({
  start: `${date}T${String(from).padStart(2, "0")}:00:00+13:00`, end: `${date}T${String(to).padStart(2, "0")}:00:00+13:00`,
  score, rating: score >= 7.5 ? "great" : score >= 6 ? "good" : score >= 4.5 ? "marginal" : "poor", headline: "", advice: "", reasons: [], near_best: true, ...extra,
});
const fc = (id: string, name: string, windows: FishingWindow[]) => ({ spot: { id, name }, verdict: { horizon_days: 3, window: null }, windows, days: [], hourly: [], tides: [] }) as unknown as SpotForecast;
const pro: AlertAccount = { plan: "pro", paused_until: null, alerts_enabled: false, fishing_times: ["any"] };
const on = { enabled: true, spots_off: [] as string[] };

const gulf = fc("hauraki_gulf", "Hauraki Gulf (inner)", [win("2026-10-31", 6, 10, 6.8, { wind_kn: 8.4, wind_from: "SW", wave_m: 0.62 })]);
const soso = fc("raglan", "Raglan", [win("2026-10-30", 16, 19, 5.2)]);
const today = fc("tutukaka", "Tutukaka", [win("2026-10-29", 15, 18, 8.1)]);
const kaik = fc("kaikoura", "Kaikoura", [win("2026-10-30", 5, 9, 7.9)]);

test("push only sends good or better, 1 to 2 days ahead", () => {
  const p = planUserPush(pro, on, [gulf, soso, today, kaik], [], NOW);
  assert.deepEqual(p.map((x) => x.spot_id).sort(), ["hauraki_gulf", "kaikoura"]);
  // email keeps its own lower bar on the same candidates (and its cap of 2)
  assert.equal(planAlerts([gulf, soso, today], ["any"], [], NOW, EMAIL_RULE).length, 2);
});

test("message reads like the brief", () => {
  const p = planUserPush(pro, on, [gulf], [], NOW)[0];
  const m = pushMessage(gulf.spot, p.call);
  assert.equal(m.title, "Hauraki Gulf: good fishing Sat 6 to 10am.");
  assert.equal(m.body, "Wind 8 kn SW, sea 0.6 m.");
  assert.equal(m.url, "/spots/hauraki_gulf");
  assert.equal(pushMessage(kaik.spot, planUserPush(pro, on, [kaik], [], NOW)[0].call).title, "Kaikoura: great fishing Fri 5 to 9am.");
  assert.equal(pushMessage({ id: "x", name: "X" }, { ...p.call, start: "2026-10-31T11:00:00+13:00", end: "2026-10-31T14:00:00+13:00" }).title, "X: good fishing Sat 11am to 2pm.");
});

test("at most one per spot per NZ day, never the same window twice", () => {
  const two = fc("hauraki_gulf", "Hauraki Gulf", [win("2026-10-30", 6, 9, 6.5), win("2026-10-31", 6, 10, 7)]);
  const first = planUserPush(pro, on, [two], [], NOW);
  assert.equal(first.length, 1);
  const sent: SentAlert[] = sentRows(first, NOW, "push");
  assert.equal(planUserPush(pro, on, [two], sent, NOW + 3 * 3600e3).length, 0, "same NZ day: nothing more for this spot");
  const next = planUserPush(pro, on, [two], sent, NOW + 24 * 3600e3);
  assert.ok(next.every((x) => x.call.start !== first[0].call.start), "next day: never the same window");
  // an email already sent for the window doesn't block the push (separate channel)
  const emailed = sentRows(first, NOW, "email");
  assert.equal(planUserPush(pro, on, [two], emailed, NOW).length, 1);
});

test("quiet hours 9pm to 7am NZ", () => {
  assert.equal(inQuiet(PUSH_RULE.quiet, Date.parse("2026-10-28T08:30:00Z")), true);  // 9:30pm NZDT
  assert.equal(inQuiet(PUSH_RULE.quiet, Date.parse("2026-10-28T17:59:00Z")), true);  // 6:59am
  assert.equal(inQuiet(PUSH_RULE.quiet, Date.parse("2026-10-28T18:00:00Z")), false); // 7:00am
  assert.equal(planUserPush(pro, on, [gulf], [], Date.parse("2026-10-29T10:00:00Z")).length, 0); // 11pm Thu
});

test("switches: per-spot off, push off, free, paused", () => {
  assert.equal(planUserPush(pro, { enabled: true, spots_off: ["hauraki_gulf"] }, [gulf, kaik], [], NOW).length, 1);
  assert.equal(planUserPush(pro, { enabled: false, spots_off: [] }, [gulf], [], NOW).length, 0);
  assert.equal(planUserPush({ ...pro, plan: "free" }, on, [gulf], [], NOW).length, 0);
  assert.equal(planUserPush({ ...pro, paused_until: "2027-03-01T00:00:00Z" }, on, [gulf], [], NOW).length, 0);
  assert.equal(planUserPush({ ...pro, fishing_times: ["weekday_evening"] }, on, [gulf], [], NOW).length, 0, "outside fishing times");
});
