// "How'd it go?" checks. Run: npx tsx scripts/check-feedback.ts
// Tokens (valid, expiry, tamper), GET never records, one answer per alert, change within 7 days,
// send timing (8am NZ next day, DST), skip paused/unsubscribed, dedupe, didnt_go out of hit rates,
// export has no user ids, engine 2.4 window.id / target_species (fixture) with older output fallback.
delete process.env.SUPABASE_URL; delete process.env.RESEND_API_KEY; delete process.env.FEEDBACK_SECRET; // mock mode only
import { allForecasts } from "../src/lib/forecasts";
import { planAlerts, sentRows, windowIdOf } from "../src/lib/alerts";
import { howdItGoEmail, wordsBeforeButton } from "../src/lib/emails";
import { mockOutbox } from "../src/lib/mailer";
import {
  CHANGE_DAYS, DEMO_ALERT_ID, TOKEN_DAYS, dueFollowups, exportCsv, exportForBrain, feedbackStore, followupFor, hitRate, hitRateBy, makeToken, memoryStore,
  nzAt, recordAnswer, recordSpecies, runFollowups, speciesFor, verifyToken, viewFor, type AlertRow, type FeedbackRow, type FollowupAccount,
} from "../src/lib/feedback";
import * as route from "../src/app/api/howd-it-go/route";
import Page from "../src/app/howd-it-go/[token]/page";
import type { SpotForecast } from "../src/lib/types";

const probs: string[] = [];
let n = 0;
const eq = (what: string, got: unknown, want: unknown) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) probs.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
const DAY = 864e5, H = 36e5;
const at = (s: string) => Date.parse(s);

// Alert: Sat 30 Oct 2027 5pm to 8pm NZDT at Bay of Islands, sent Thu 28 Oct
const alert = (o: Partial<AlertRow> = {}): AlertRow => ({ id: "a1", user_id: "user-1", spot_id: "bay_of_islands", window_start: "2027-10-30T17:00:00+13:00", window_end: "2027-10-30T20:00:00+13:00", score: 7.2, sent_at: "2027-10-28T07:00:00+13:00", window_id: "bay_of_islands:2027-10-30T17:00:00+13:00/2027-10-30T20:00:00+13:00", target_species: ["snapper", "kingfish"], ...o });
const sent = at("2027-10-31T08:00:00+13:00");

async function main() {
  // ---- tokens
  const tok = makeToken("a1", sent), [id, exp, sig] = tok.split(".");
  eq("token valid", verifyToken(tok, sent + H), { ok: true, alertId: "a1", exp: Number(exp) });
  eq("token exp is 14 days", Number(exp) * 1000 - sent, TOKEN_DAYS * DAY);
  eq("token valid just before expiry", verifyToken(tok, Number(exp) * 1000 - 1).ok, true);
  eq("token expired at expiry", verifyToken(tok, Number(exp) * 1000), { ok: false, reason: "expired" });
  const flip = (s: string) => s.slice(0, -1) + (s.at(-1) === "A" ? "B" : "A");
  eq("tampered signature", verifyToken(`${id}.${exp}.${flip(sig)}`, sent), { ok: false, reason: "bad" });
  eq("tampered alert id", verifyToken(`a2.${exp}.${sig}`, sent), { ok: false, reason: "bad" });
  eq("tampered expiry (extended)", verifyToken(`${id}.${Number(exp) + 86400 * 30}.${sig}`, sent), { ok: false, reason: "bad" });
  eq("expired and tampered says bad", verifyToken(`${id}.${Number(exp) + 1}.${sig}`, Number(exp) * 1000 + DAY).ok, false);
  eq("other secret", verifyToken(makeToken("a1", sent, "other"), sent), { ok: false, reason: "bad" });
  for (const junk of ["", "a.b", "a1.x.y", "a1.1.2.3", "../etc.1.x", tok + "x"]) eq(`junk token ${junk}`, verifyToken(junk, sent).ok, false);

  // ---- email
  const links = { caught: "https://x/c", nothing: "https://x/n", didnt_go: "https://x/d" };
  const m = howdItGoEmail("Bay of Islands", alert().window_start, alert().window_end, links);
  eq("email subject", m.subject, "How'd it go at Bay of Islands last night?");
  eq("email body", m.body, ["Your alert was for Sat 5pm to 8pm. Get anything?"]);
  eq("email buttons", [m.cta.label, ...(m.more ?? []).map((b) => b.label)], ["Caught something", "Nothing doing", "Didn't go"]);
  eq("email links", [m.cta.href, ...(m.more ?? []).map((b) => b.href)], [links.caught, links.nothing, links.didnt_go]);
  eq("morning window says yesterday", howdItGoEmail("Hauraki Gulf (Auckland)", "2027-10-30T05:00:00+13:00", "2027-10-30T08:00:00+13:00", links).subject, "How'd it go at Hauraki Gulf yesterday?");
  eq("long name falls back", howdItGoEmail("A really very long spot name that goes on and on forever", alert().window_start, alert().window_end, links).subject, "How'd it go last night?");
  eq("email short", [m.subject.length <= 60, wordsBeforeButton(m) <= 20], [true, true]);
  const f = followupFor(alert(), sent), t = new URL(f.cta.href).pathname.split("/").pop()!;
  eq("email links carry one token per alert", [f.cta.href, ...(f.more ?? []).map((b) => b.href)].map((h) => new URL(h).pathname.split("/").pop()), [t, t, t]);
  eq("email token verifies", verifyToken(t, sent).ok, true);
  eq("email answers", [f.cta.href, ...(f.more ?? []).map((b) => b.href)].map((h) => new URL(h).searchParams.get("o")), ["caught", "nothing", "didnt_go"]);

  // ---- send timing: day after the window started, from 8am NZ, until the end of that NZ day
  const acc: Record<string, FollowupAccount> = { "user-1": { email: "u1@example.nz", paused_until: null, unsubscribed: false } };
  const due = (a: AlertRow, now: number, ac = acc) => dueFollowups([a], ac, now).length;
  eq("7:59am next day not yet", due(alert(), at("2027-10-31T07:59:00+13:00")), 0);
  eq("8am next day due", due(alert(), at("2027-10-31T08:00:00+13:00")), 1);
  eq("11:59pm next day still due (catch-up)", due(alert(), at("2027-10-31T23:59:00+13:00")), 1);
  eq("day after that is stale", due(alert(), at("2027-11-01T00:00:00+13:00")), 0);
  eq("same evening not due", due(alert(), at("2027-10-30T21:00:00+13:00")), 0);
  const late = alert({ window_start: "2027-10-30T22:00:00+13:00", window_end: "2027-10-31T09:00:00+13:00" });
  eq("window ending after 8am waits for the end", [due(late, at("2027-10-31T08:30:00+13:00")), due(late, at("2027-10-31T09:00:00+13:00"))], [0, 1]);
  eq("8am NZ during DST start day", new Date(nzAt("2027-09-26", 8)).toISOString(), "2027-09-25T19:00:00.000Z");
  eq("8am NZ on DST end day", new Date(nzAt("2027-04-04", 8)).toISOString(), "2027-04-03T20:00:00.000Z");
  eq("8am NZ winter", new Date(nzAt("2027-07-01", 8)).toISOString(), "2027-06-30T20:00:00.000Z");
  const dst = alert({ window_start: "2027-09-25T17:00:00+12:00", window_end: "2027-09-25T19:00:00+12:00" });
  eq("DST: due at 8am NZDT", [due(dst, at("2027-09-26T07:59:00+13:00")), due(dst, at("2027-09-26T08:00:00+13:00"))], [0, 1]);
  const ny = alert({ window_start: "2027-12-31T18:00:00+13:00", window_end: "2027-12-31T21:00:00+13:00" });
  eq("new year: due 1 Jan 8am", [due(ny, at("2028-01-01T07:59:00+13:00")), due(ny, at("2028-01-01T08:00:00+13:00"))], [0, 1]);
  eq("UTC date differs from NZ date", due(alert({ window_start: "2027-10-30T05:00:00+13:00", window_end: "2027-10-30T08:00:00+13:00" }), at("2027-10-31T08:00:00+13:00")), 1);

  // ---- skip paused / unsubscribed / unknown / already sent
  const now = at("2027-10-31T08:05:00+13:00");
  eq("paused user skipped", due(alert(), now, { "user-1": { ...acc["user-1"], paused_until: "2028-02-01T00:00:00+13:00" } }), 0);
  eq("paused with no end date skipped", due(alert(), now, { "user-1": { ...acc["user-1"], paused_until: "infinity" } }), 0);
  eq("pause that has ended: sent", due(alert(), now, { "user-1": { ...acc["user-1"], paused_until: "2027-10-01T00:00:00+13:00" } }), 1);
  eq("unsubscribed skipped", due(alert(), now, { "user-1": { ...acc["user-1"], unsubscribed: true } }), 0);
  eq("no account skipped", due(alert({ user_id: "nobody" }), now), 0);
  eq("already sent skipped", due(alert({ followup_sent_at: "2027-10-31T08:00:00+13:00" }), now), 0);

  // ---- one email per alert, across repeated job runs
  const alerts = [alert(), alert({ id: "a2", spot_id: "hauraki_gulf", window_id: null, target_species: null }), alert({ id: "a3", user_id: "user-2" })];
  const accs = { ...acc, "user-2": { email: "u2@example.nz", paused_until: null, unsubscribed: true } };
  const before = mockOutbox.length;
  const r1 = await runFollowups(alerts, accs, now);
  eq("run 1 sends a1 and a2, not unsubscribed a3", r1.map((r) => r.alert_id), ["a1", "a2"]);
  const applied = alerts.map((a) => ({ ...a, followup_sent_at: r1.find((r) => r.alert_id === a.id)?.followup_sent_at ?? null }));
  for (const t2 of [now, now + H, now + 5 * H]) eq(`rerun after marking: nothing (${new Date(t2).toISOString()})`, (await runFollowups(applied, accs, t2)).length, 0);
  await runFollowups(alerts, accs, now); // the marker write was lost: Resend idempotency key stops a second email
  eq("lost marker: no second email", mockOutbox.length - before, 2);
  eq("duplicate alert row in one run: one email", dueFollowups([alert(), alert()], acc, now).length, 1);
  eq("one email per alert (two alerts, same user, same day)", dueFollowups([alert(), alert({ id: "b", spot_id: "hauraki_gulf" })], acc, now).length, 2);

  // ---- answering: GET never records, one answer per alert, change within 7 days
  const s = memoryStore([alert()]), tk = makeToken("a1", sent);
  const v0 = await viewFor(tk, s, sent + H);
  eq("view ok", [v0.state, v0.feedback, v0.canChange, s.writes()], ["ok", null, true, 0]);
  eq("species chips: target first, then spot list", v0.species.slice(0, 3), ["Snapper", "Kingfish", "Kahawai"]);
  eq("view expired", (await viewFor(tk, s, sent + TOKEN_DAYS * DAY)).state, "expired");
  eq("view bad", (await viewFor(tk.slice(0, -2) + "zz", s, sent)).state, "bad");
  eq("view unknown alert", (await viewFor(makeToken("zz", sent), s, sent)).state, "gone");
  eq("GET views wrote nothing", [s.writes(), s.rows.size], [0, 0]);

  const a1 = await recordAnswer(tk, "nothing", s, sent + H);
  eq("first answer", a1.ok && [a1.row.outcome, a1.row.species, a1.row.window_id, a1.row.target_species], ["nothing", [], alert().window_id, ["snapper", "kingfish"]]);
  const a2 = await recordAnswer(tk, "caught", s, sent + 2 * DAY);
  eq("change answer: still one row", [s.rows.size, a2.ok && a2.row.outcome, a2.ok && a2.row.created_at], [1, "caught", new Date(sent + H).toISOString()]);
  const sp = await recordSpecies(tk, ["snapper", "KINGFISH", "moa", "snapper"], s, sent + 2 * DAY);
  eq("species limited to the spot list", sp.ok && sp.row.species, ["Snapper", "Kingfish"]);
  eq("skip = no species", ((await recordSpecies(tk, [], s, sent + 2 * DAY)) as { row: FeedbackRow }).row.species, []);
  await recordSpecies(tk, ["kahawai"], s, sent + 2 * DAY);
  eq("re-saying caught keeps species", ((await recordAnswer(tk, "caught", s, sent + 3 * DAY)) as { row: FeedbackRow }).row.species, ["Kahawai"]);
  eq("didnt_go clears species", ((await recordAnswer(tk, "didnt_go", s, sent + 4 * DAY)) as { row: FeedbackRow }).row.species, []);
  eq("species on a non-catch refused", (await recordSpecies(tk, ["snapper"], s, sent + 4 * DAY)).ok, false);
  eq("bad outcome refused", await recordAnswer(tk, "maybe", s, sent + 4 * DAY), { ok: false, error: "bad_outcome" });
  eq("change just inside 7 days", (await recordAnswer(tk, "nothing", s, sent + H + CHANGE_DAYS * DAY - 1)).ok, true);
  eq("change after 7 days locked", await recordAnswer(tk, "caught", s, sent + H + CHANGE_DAYS * DAY), { ok: false, error: "locked" });
  eq("locked answer unchanged", s.rows.get("a1")!.outcome, "nothing");
  eq("view after 7 days: can't change", (await viewFor(tk, s, sent + H + CHANGE_DAYS * DAY)).canChange, false);
  eq("tampered token can't answer", (await recordAnswer(tk.replace("a1.", "a2."), "caught", s, sent)).ok, false);
  const s2 = memoryStore([alert()]);
  eq("first answer after the token expired", await recordAnswer(tk, "caught", s2, sent + TOKEN_DAYS * DAY), { ok: false, error: "expired" });
  eq("first answer on day 13, change window capped by the token", [(await recordAnswer(tk, "caught", s2, sent + 13 * DAY)).ok, (await recordAnswer(tk, "nothing", s2, sent + TOKEN_DAYS * DAY)).ok], [true, false]);
  eq("one answer per alert", [s.rows.size, s2.rows.size], [1, 1]);

  // ---- the real page and route (global mock store, demo alert)
  const g = feedbackStore() as ReturnType<typeof memoryStore>, dt = makeToken(DEMO_ALERT_ID, Date.now());
  const w0 = g.writes();
  for (const o of ["caught", "nothing", "didnt_go", undefined]) await Page({ params: Promise.resolve({ token: dt }), searchParams: Promise.resolve(o ? { o } : {}) });
  await Page({ params: Promise.resolve({ token: dt }), searchParams: Promise.resolve({ saved: "species" }) });
  eq("GET page (all answers, species step) records nothing", [g.writes() - w0, g.rows.has(DEMO_ALERT_ID)], [0, false]);
  eq("route has no GET handler", ["GET", "HEAD", "PUT", "PATCH", "DELETE"].filter((k) => k in route), []);
  const form = (fields: [string, string][]) => { const b = new URLSearchParams(fields); return route.POST(new Request("http://x/api/howd-it-go", { method: "POST", body: b, headers: { "content-type": "application/x-www-form-urlencoded" } })); };
  const p1 = await form([["token", dt], ["o", "caught"]]);
  eq("POST caught: saved, then species step", [p1.status, new URL(p1.headers.get("location")!).searchParams.get("saved"), g.rows.get(DEMO_ALERT_ID)?.outcome], [303, "species", "caught"]);
  const p2 = await form([["token", dt], ["step", "species"], ["species", "Snapper"], ["species", "Trevally"]]);
  eq("POST species", [p2.status, g.rows.get(DEMO_ALERT_ID)?.species], [303, ["Snapper", "Trevally"]]);
  const p3 = await form([["token", dt], ["step", "species"], ["skip", "1"]]);
  eq("POST skip", [new URL(p3.headers.get("location")!).searchParams.get("saved"), g.rows.get(DEMO_ALERT_ID)?.species], ["1", []]);
  const p4 = await form([["token", dt.replace(/.$/, (c) => (c === "A" ? "B" : "A"))], ["o", "nothing"]]);
  eq("POST tampered", [new URL(p4.headers.get("location")!).searchParams.get("error"), g.rows.get(DEMO_ALERT_ID)?.outcome], ["bad", "caught"]);
  const j = await route.POST(new Request("http://x/api/howd-it-go", { method: "POST", body: JSON.stringify({ token: dt, o: "didnt_go" }), headers: { "content-type": "application/json" } }));
  eq("POST json didnt_go", [j.status, await j.json(), g.rows.size], [200, { outcome: "didnt_go", species: [] }, 1]);
  g.rows.clear();

  // ---- hit rate: didnt_go never counts
  const row = (outcome: FeedbackRow["outcome"], o: Partial<FeedbackRow> = {}): FeedbackRow => ({ alert_id: Math.random().toString(36), user_id: "user-secret-1", spot_id: "bay_of_islands", window_id: "w", window_start: "2027-10-30T04:00:00.000Z", window_end: "2027-10-30T07:00:00.000Z", score: 7.2, target_species: null, outcome, species: [], created_at: "x", updated_at: "x", ...o });
  const rows = [row("caught"), row("nothing"), row("didnt_go"), row("didnt_go"), row("didnt_go")];
  eq("hit rate excludes didnt_go", hitRate(rows), { answers: 2, caught: 1, rate: 0.5 });
  eq("only didnt_go: no rate", hitRate([row("didnt_go")]), { answers: 0, caught: 0, rate: null });
  eq("hit rate by spot excludes didnt_go", hitRateBy([...rows, row("didnt_go", { spot_id: "hauraki_gulf" })], (r) => r.spot_id), { bay_of_islands: { answers: 2, caught: 1, rate: 0.5 }, hauraki_gulf: { answers: 0, caught: 0, rate: null } });

  // ---- export: no user ids, didnt_go kept as its own outcome
  const exp2 = exportForBrain(rows);
  eq("export columns", Object.keys(exp2[0]), ["spot_id", "window_id", "target_species", "window_start", "window_end", "score", "outcome", "species"]);
  const blob = JSON.stringify(exp2) + exportCsv(rows);
  eq("export has no user or alert ids", [/user/i.test(blob), rows.some((r) => blob.includes(r.alert_id))], [false, false]);
  eq("export keeps didnt_go", exp2.filter((r) => r.outcome === "didnt_go").length, 3);
  eq("csv header", exportCsv(rows).split("\n")[0], "spot_id,window_id,window_start,window_end,score,outcome,species,target_species");

  // ---- engine 2.4 window.id + target_species (fixture), older output falls back
  const fc = allForecasts().find((x) => x.windows.some((w) => w.score >= 4.5));
  if (!fc) probs.push("no forecast with a window to test window ids");
  else {
    const w = fc.windows.find((x) => x.score >= 4.5)!, nowF = Date.parse(w.start) - 30 * H;
    const v24: SpotForecast = { ...fc, windows: fc.windows.map((x) => ({ ...x, id: `${fc.spot.id}:${x.start}/${x.end}#v24`, target_species: ["snapper"] })), days: fc.days.map((d) => ({ ...d, best_window: d.best_window && { ...d.best_window, id: `${fc.spot.id}:${d.best_window.start}/${d.best_window.end}#v24`, target_species: ["snapper"] } })) };
    const rNew = sentRows(planAlerts([v24], ["any"], [], nowF), nowF), rOld = sentRows(planAlerts([fc], ["any"], [], nowF), nowF);
    if (!rNew.length || !rOld.length) probs.push(`window id fixture: no alert planned (${fc.spot.id})`);
    else {
      eq("2.4: window id stored as it was", rNew[0].window_id, `${fc.spot.id}:${rNew[0].window_start}/${rNew[0].window_end}#v24`);
      eq("2.4: target species snapshot", rNew[0].target_species, ["snapper"]);
      eq("older output: id built as spot:start/end", rOld[0].window_id, `${fc.spot.id}:${rOld[0].window_start}/${rOld[0].window_end}`);
      eq("older output: no target species", rOld[0].target_species, null);
    }
    eq("windowIdOf hourly (no engine window)", windowIdOf("x", { start: "s", end: "e", window: null }), "x:s/e");
  }
  eq("chips without target species", speciesFor("bay_of_islands", null)[0], "Snapper");
}

main().then(() => {
  console.log(`check-feedback: ${n} checks, ${probs.length} problems`);
  probs.forEach((p) => console.log("  !", p));
  process.exit(probs.length ? 1 : 0);
});
