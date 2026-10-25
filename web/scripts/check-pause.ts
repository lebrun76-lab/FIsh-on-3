// "Pause for winter" checks. Run: npx tsx scripts/check-pause.ts [ISO time ...]
// Dates and Stripe params, the pause/resume routes (mock Stripe), the webhook (signature + sync),
// and alerts: paused users get 0, resumed users get the normal plan.
import fs from "node:fs";
import { allForecasts } from "../src/lib/forecasts";
import { planAlerts, planUserAlerts, sentRows, type AlertAccount } from "../src/lib/alerts";
import { DEFAULT_FISH_TIMES, type FishTime } from "../src/lib/fishtimes";
import { NO_END, PAUSE_MONTHS, effectivePlan, isPauseMonths, isPaused, nzMidnight, pauseEndDate, pauseLabel, resumesAtFor } from "../src/lib/pause";
import { mockSynced, pauseParams, resumeParams, signPayload, syncFromSubscription, verifySignature, webhookSecret, type StripeSubscription } from "../src/lib/stripe";
import { POST as pauseRoute } from "../src/app/api/billing/pause/route";
import { POST as resumeRoute } from "../src/app/api/billing/resume/route";
import { POST as webhookRoute } from "../src/app/api/stripe/webhook/route";

delete process.env.STRIPE_SECRET_KEY; delete process.env.SUPABASE_URL; delete process.env.STRIPE_WEBHOOK_SECRET; // mock mode only
const probs: string[] = [];
const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) probs.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
const nz = (s: string) => Date.parse(s);

// ---- dates (NZ calendar; resumes_at is 00:00 NZ on the end date)
const oct26 = nz("2026-10-26T09:49:00+13:00");
eq("1 month", pauseEndDate(1, oct26), "2026-11-26");
eq("6 months", pauseEndDate(6, oct26), "2027-04-26");
eq("3 months over new year", pauseEndDate(3, nz("2026-11-15T12:00:00+13:00")), "2027-02-15");
eq("31 Aug + 1 clamps", pauseEndDate(1, nz("2026-08-31T12:00:00+12:00")), "2026-09-30");
eq("31 Dec + 2 clamps", pauseEndDate(2, nz("2026-12-31T12:00:00+13:00")), "2027-02-28");
eq("NZ date not UTC date", pauseEndDate(1, nz("2026-10-31T23:30:00+13:00")), "2026-11-30");
eq("midnight NZDT", new Date(nzMidnight("2027-01-26") * 1000).toISOString(), "2027-01-25T11:00:00.000Z");
eq("midnight NZST", new Date(nzMidnight("2027-06-26") * 1000).toISOString(), "2027-06-25T12:00:00.000Z");
eq("label", pauseLabel(new Date(nzMidnight("2027-01-26") * 1000).toISOString()), "Tue 26 Jan 2027");
eq("months allowed", [0, 1, 6, 7, 2.5, "3"].map(isPauseMonths), [false, true, true, false, false, false]);
eq("paused now / passed / none / no end", [isPaused("2027-01-01T00:00:00Z", oct26), isPaused("2026-10-01T00:00:00Z", oct26), isPaused(null, oct26), isPaused(NO_END, oct26)], [true, false, false, true]);
eq("free tier while paused", [effectivePlan("pro", "2027-01-01T00:00:00Z", oct26), effectivePlan("pro", null, oct26), effectivePlan("pro", "2026-10-01T00:00:00Z", oct26)], ["free", "pro", "pro"]);

// ---- Stripe request bodies
const ra = resumesAtFor(3, oct26);
eq("pause params", Object.fromEntries(new URLSearchParams(pauseParams(ra))), { "pause_collection[behavior]": "void", "pause_collection[resumes_at]": String(ra) });
eq("resume params", resumeParams(), "pause_collection=");

// ---- webhook signature
const sec = "whsec_test_check";
const body = JSON.stringify({ type: "customer.subscription.updated" });
const t = Math.floor(oct26 / 1000);
eq("signature ok", verifySignature(body, signPayload(body, sec, t), sec, oct26), true);
eq("tampered body", verifySignature(body + " ", signPayload(body, sec, t), sec, oct26), false);
eq("wrong secret", verifySignature(body, signPayload(body, "whsec_other", t), sec, oct26), false);
eq("old timestamp", verifySignature(body, signPayload(body, sec, t - 301), sec, oct26), false);
eq("no header", verifySignature(body, null, sec, oct26), false);

// ---- sync mapping
const sub = (pc: StripeSubscription["pause_collection"]): StripeSubscription => ({ id: "sub_1", object: "subscription", customer: "cus_1", status: "active", pause_collection: pc, items: { data: [{ current_period_end: t + 86400, price: { id: "price_1" } }] } });
eq("sync paused", syncFromSubscription(sub({ behavior: "void", resumes_at: ra })).profile.paused_until, new Date(ra * 1000).toISOString());
eq("sync resumed", syncFromSubscription(sub(null)).profile.paused_until, null);
eq("sync no end date", syncFromSubscription(sub({ behavior: "void", resumes_at: null })).profile.paused_until, NO_END);
eq("sync deleted", syncFromSubscription(sub({ behavior: "void", resumes_at: ra }), true).subscription, { ...syncFromSubscription(sub(null)).subscription, status: "canceled" });

// ---- copy: plain, no em dashes
for (const f of ["src/components/PauseControl.tsx", "src/lib/pause.ts"]) if (/—/.test(fs.readFileSync(f, "utf8"))) probs.push(`${f}: em dash`);

async function routes() {
  const post = (h: (r: Request) => Promise<Response>, b?: object, headers: Record<string, string> = {}) => h(new Request("http://x/api", { method: "POST", body: typeof b === "string" ? b : JSON.stringify(b ?? {}), headers }));
  for (const m of PAUSE_MONTHS) {
    const r = await post(pauseRoute, { months: m }), j = await r.json();
    eq(`pause route ${m}`, [r.status, j.pause_collection?.behavior, j.pause_collection?.resumes_at, j.paused_until], [200, "void", resumesAtFor(m), new Date(resumesAtFor(m) * 1000).toISOString()]);
  }
  for (const bad of [0, 7, "x", null]) eq(`pause route rejects ${bad}`, (await post(pauseRoute, { months: bad })).status, 400);
  const res = await post(resumeRoute), rj = await res.json();
  eq("resume route", [res.status, rj.pause_collection, rj.paused_until], [200, null, null]);

  // webhook round trip: pause event -> paused_until; resume event -> null; bad signature -> 400
  const send = async (pc: StripeSubscription["pause_collection"], type = "customer.subscription.updated", sig?: string) => {
    const payload = JSON.stringify({ id: "evt_1", type, data: { object: sub(pc) } });
    const r = await post(webhookRoute, payload as unknown as object, { "stripe-signature": sig ?? signPayload(payload, webhookSecret()!) });
    return { status: r.status, j: await r.json() };
  };
  const before = mockSynced.length;
  const p1 = await send({ behavior: "void", resumes_at: ra });
  eq("webhook pause", [p1.status, p1.j.saved, p1.j.paused_until], [200, "mock", new Date(ra * 1000).toISOString()]);
  const p2 = await send(null);
  eq("webhook resume", [p2.status, p2.j.paused_until], [200, null]);
  eq("webhook bad signature", (await send(null, undefined, "t=1,v1=00")).status, 400);
  eq("webhook other event ignored", (await send(null, "invoice.paid")).j.ignored, "invoice.paid");
  eq("webhook rows written", mockSynced.length - before, 2);
}

// ---- alerts: paused = 0, resumed = normal
const TIME_SETS: FishTime[][] = [DEFAULT_FISH_TIMES, ["any"], ["saturday", "sunday"], ["weekday_morning"]];
function alerts(at: number) {
  let normal = 0;
  const all = allForecasts();
  for (const times of TIME_SETS) {
    const base: AlertAccount = { plan: "pro", paused_until: null, alerts_enabled: true, fishing_times: times };
    const want = planAlerts(all, times, [], at);
    normal += want.length;
    const id = `[${times}] ${new Date(at).toISOString()}`;
    for (const m of PAUSE_MONTHS) {
      const until = new Date(resumesAtFor(m, at) * 1000).toISOString();
      // every daily run while paused sends nothing
      for (let d = 0; d * 864e5 < Date.parse(until) - at; d += 7) if (planUserAlerts({ ...base, paused_until: until }, all, [], at + d * 864e5).length) probs.push(`${id}: paused ${m} months but alerted on day ${d}`);
      if (planUserAlerts({ ...base, paused_until: until }, all, [], Date.parse(until) - 1).length) probs.push(`${id}: alerted the second before the pause ends`);
    }
    if (planUserAlerts({ ...base, paused_until: NO_END }, all, [], at).length) probs.push(`${id}: alerted while paused with no end`);
    for (const plan of ["trial", "pro_annual"] as const) if (planUserAlerts({ ...base, plan, paused_until: new Date(at + 864e5).toISOString() }, all, [], at).length) probs.push(`${id}: ${plan} alerted while paused`);
    // resume: "Resume now" (null) or the date passing gives exactly the normal plan
    eq(`${id} resume now`, planUserAlerts(base, all, [], at), want);
    eq(`${id} pause ended`, planUserAlerts({ ...base, paused_until: new Date(at - 1).toISOString() }, all, [], at), want);
    // resumed users still respect the cap and never get a repeat
    if (want.length) eq(`${id} cap after resume`, planUserAlerts(base, all, sentRows(want, at - 36e5), at), []);
    if (planUserAlerts({ ...base, plan: "free" }, all, [], at).length || planUserAlerts({ ...base, alerts_enabled: false }, all, [], at).length) probs.push(`${id}: free or alerts-off user alerted`);
  }
  return normal;
}

(async () => {
  await routes();
  const times = process.argv.slice(2).map(Date.parse);
  const runs = times.length ? times : [Date.now()];
  const counts = runs.map((at) => `${new Date(at).toISOString()}: ${alerts(at)} alerts unpaused; paused users 0`);
  console.log(`check-pause: ${probs.length} problems`); counts.forEach((c) => console.log("  " + c));
  probs.forEach((p) => console.log("  !", p));
  process.exit(probs.length ? 1 : 0);
})();
