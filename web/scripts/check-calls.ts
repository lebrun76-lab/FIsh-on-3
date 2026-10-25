// Consistency check: every badge must match the call it sits next to.
// Run: npx tsx scripts/check-calls.ts [ISO time ...]
// Each forecast is checked as loaded AND with the feat/windows-and-copy fields stripped
// (near_best, score_remaining, remaining_from, score_full_day, and 2.3's valid_until /
// tide_port_linz_name), so older output keeps working.
import { allSummaries, regionCalls } from "../src/lib/summaries";
import { allForecasts } from "../src/lib/forecasts";
import { alertCall, alertDates, pickOf, bestCall, dayScore, isNearBest, listsAllWindows, ratingFor, todayStale } from "../src/lib/call";
import { nzTodayISO } from "../src/lib/time";
import { plain, plainDeep, portNames, tideSourceText } from "../src/lib/plain";
import type { FishingWindow, SpotForecast } from "../src/lib/types";
import { ALERT_CAP, ALERT_CAP_DAYS, byBest, planAlerts, sentInCap, sentRows, type SentAlert } from "../src/lib/alerts";
import { DEFAULT_FISH_TIMES, fitsTimes, normaliseTimes, toggleTime, type FishTime } from "../src/lib/fishtimes";
import { alertEmail, shortSpot, welcomeEmail, trialEndingEmail, wordsBeforeButton, type EmailTemplate } from "../src/lib/emails";

const DASH = /—| [-–] /;                       // no em dashes, no spaced dashes
const HYPE = /\b(unlock|elevate|revolutioni[sz]e|AI[- ]powered|game[- ]chang|supercharge|seamless)/i;
const copyProbs = (where: string, s: string) => [DASH.test(s) ? `${where}: dash "${s}"` : "", HYPE.test(s) ? `${where}: hype "${s}"` : ""].filter(Boolean);

const HYPHEN_RANGE = /\b\d{1,2}(:\d\d)?(am|pm)?-\d{1,2}(:\d\d)?(am|pm)\b/; // "8-11am": 2.3 uses an en dash
const rangeProbs = (where: string, s: string) => (HYPHEN_RANGE.test(s) ? [`${where}: hyphen time range "${s}"`] : []);

const stripW = (w: FishingWindow | null | undefined) => { if (!w) return w; const { near_best: _n, ...rest } = w; return rest as FishingWindow; };
const legacy = (f: SpotForecast): SpotForecast => ({
  ...f, valid_until: undefined, spot: { ...f.spot, tide_port_linz_name: undefined },
  windows: f.windows.map((w) => stripW(w)!),
  days: f.days.map(({ score_remaining: _a, remaining_from: _b, score_full_day: _c, ...d }) => ({ ...d, best_window: stripW(d.best_window), least_bad_window: stripW(d.least_bad_window) })),
});

const fixed: string[] = [];
// Emails: five-second read. Subject <= 60 chars with the window time and spot; <= 40 words before the
// button; one button; short preheader; no em dashes, hype or emoji; an unsubscribe link.
const EMAIL_HYPE = /\b(amazing|epic|incredible|awesome|unmissable|don'?t miss|exclusive|perfect|insane|killer|banger)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const emailProbs = (where: string, m: EmailTemplate) => {
  const out: string[] = [];
  if (m.preheader.length > 50) out.push(`${where}: preheader over 50 chars "${m.preheader}"`);
  if (!m.unsubscribe.href.includes("unsubscribe")) out.push(`${where}: no unsubscribe link`);
  for (const s of [m.subject, m.preheader, ...m.body, m.cta.label, m.footer]) {
    out.push(...copyProbs(where, s));
    if (/—/.test(s)) out.push(`${where}: em dash "${s}"`);
    if (EMAIL_HYPE.test(s)) out.push(`${where}: hype "${s}"`);
    if (EMOJI.test(s) || /[→←]/.test(s)) out.push(`${where}: emoji or arrow "${s}"`);
  }
  return out;
};
{
  const w = welcomeEmail();
  fixed.push(...emailProbs("welcome email", w), ...emailProbs("trial email", trialEndingEmail("Sun 8 Nov")));
  if (w.body.length !== 3) fixed.push(`welcome email: ${w.body.length} lines, want 3`);
  if (w.body.some((l) => l.split(/\s+/).length > 16)) fixed.push("welcome email: a line over 16 words");
}

// Fishing times: fixed cases (2026-10-28 is a Wednesday, 10-31 Saturday, 11-01 Sunday)
{
  const W = (d: string, a: string, b: string) => [`2026-${d}T${a}:00+13:00`, `2026-${d}T${b}:00+13:00`] as const;
  const cases: [readonly [string, string], FishTime[], boolean][] = [
    [W("10-28", "05:00", "08:00"), ["weekday_morning"], true], [W("10-28", "06:00", "09:00"), ["weekday_morning"], true],
    [W("10-28", "08:00", "11:00"), ["weekday_morning"], false], [W("10-28", "16:00", "19:00"), ["weekday_evening"], true],
    [W("10-28", "15:00", "18:00"), ["weekday_evening"], false], [W("10-28", "18:00", "21:00"), ["saturday", "sunday"], false],
    [W("10-31", "05:00", "08:00"), ["weekday_morning"], false], [W("10-31", "10:00", "13:00"), ["saturday"], true],
    [W("11-01", "10:00", "13:00"), ["saturday"], false], [W("11-01", "10:00", "13:00"), ["sunday"], true],
    [W("10-28", "11:00", "14:00"), ["any"], true], [W("10-28", "11:00", "14:00"), DEFAULT_FISH_TIMES, false],
    [W("10-28", "18:00", "21:00"), DEFAULT_FISH_TIMES, true], [W("10-31", "05:00", "08:00"), DEFAULT_FISH_TIMES, true],
    [W("10-30", "16:00", "19:00"), DEFAULT_FISH_TIMES, true], [W("10-30", "05:00", "08:00"), DEFAULT_FISH_TIMES, false],
  ];
  for (const [[a, b], t, want] of cases) if (fitsTimes(a, b, t) !== want) fixed.push(`fitsTimes ${a.slice(5, 16)}-${b.slice(11, 16)} [${t}] gave ${!want}`);
  if (JSON.stringify(toggleTime(DEFAULT_FISH_TIMES, "any")) !== '["any"]' || JSON.stringify(toggleTime(["any"], "sunday")) !== '["sunday"]' || JSON.stringify(toggleTime(["sunday"], "sunday")) !== '["sunday"]') fixed.push("toggleTime");
  if (JSON.stringify(normaliseTimes(undefined)) !== JSON.stringify(DEFAULT_FISH_TIMES) || JSON.stringify(normaliseTimes(["sunday", "any"])) !== '["any"]') fixed.push("normaliseTimes");
}
// Alert cap: fixed ordering and window cases
{
  const o = [{ score: 7, start: "2026-10-29T05:00:00+13:00" }, { score: 8, start: "2026-10-30T05:00:00+13:00" }, { score: 7, start: "2026-10-28T18:00:00+13:00" }].sort(byBest).map((x) => `${x.score}@${x.start.slice(8, 10)}`).join(",");
  if (o !== "8@30,7@28,7@29") fixed.push(`byBest order ${o}`);
  const now = Date.parse("2026-10-26T09:00:00+13:00"), row = (daysAgo: number): SentAlert => ({ spot_id: "x", window_start: "2026-10-20T05:00:00+13:00", window_end: "2026-10-20T08:00:00+13:00", score: 6, sent_at: new Date(now - daysAgo * 864e5).toISOString() });
  if (sentInCap([row(1), row(6.9), row(ALERT_CAP_DAYS), row(9)], now).length !== 2) fixed.push("sentInCap: rolling 7 days");
}
const TIME_SETS: FishTime[][] = [DEFAULT_FISH_TIMES, ["weekday_morning"], ["weekday_evening"], ["saturday"], ["sunday"], ["any"]];

// Port names and brackets: plain() must not touch "Area (Place)"; older "Area - Place" output gets the 2.3 form.
for (const [s, want] of [["Lottin Point (Wakatiri)", "Lottin Point (Wakatiri)"], ["LINZ secondary port Coromandel Harbour (Whanganui Island) (offsets from Auckland)", "LINZ secondary port Coromandel Harbour (Whanganui Island) (offsets from Auckland)"], ["Mon 8–11am looks great", "Mon 8–11am looks great"], ["Mon 10am–1pm is fishable", "Mon 10am–1pm is fishable"], ["Best: Mon 10am-1pm.", "Best: Mon 10am–1pm."], ["Mon 8-11am, HW -21 min, 2026-10-26", "Mon 8–11am, HW -21 min, 2026-10-26"]] as const)
  if (plain(s) !== want) fixed.push(`plain("${s}") gave "${plain(s)}"`);
{
  const old = { spot: { tide_port: "Lottin Point - Wakatiri" }, tide_source: "LINZ Lottin Point - Wakatiri", sources: ["Tides: LINZ Lottin Point - Wakatiri"] };
  const n = plainDeep(portNames(old));
  if (n.spot.tide_port !== "Lottin Point (Wakatiri)" || n.tide_source !== "LINZ Lottin Point (Wakatiri)" || n.sources[0] !== "Tides: LINZ Lottin Point (Wakatiri)" || (n.spot as { tide_port_linz_name?: string }).tide_port_linz_name !== "Lottin Point - Wakatiri") fixed.push(`portNames on older output: ${JSON.stringify(n)}`);
  const n2 = portNames({ spot: { tide_port: "Lottin Point (Wakatiri)", tide_port_linz_name: "Lottin Point - Wakatiri" } });
  if (n2.spot.tide_port !== "Lottin Point (Wakatiri)") fixed.push("portNames changed 2.3 output");
  const t = tideSourceText("LINZ secondary port Coromandel Harbour (Whanganui Island) (offsets from Auckland)", 5.8);
  if (t !== "LINZ secondary port Coromandel Harbour (Whanganui Island), offsets from Auckland, 5.8 km away") fixed.push(`tideSourceText gave "${t}"`);
}

const real = Date.now;
const times = process.argv.slice(2);
let bad = 0;
for (const t of times.length ? times : [new Date().toISOString()]) {
  const at = Date.parse(t); Date.now = () => at;
  const probs: string[] = [...fixed];
  for (const s of allSummaries()) {
    const none = s.headline.startsWith("No fishable");
    if (none ? s.rating !== "poor" : s.rating !== ratingFor(s.score)) probs.push(`summary ${s.id}: ${s.rating} ${s.score} "${s.headline}"`);
    probs.push(...copyProbs(`summary ${s.id}`, s.headline));
  }
  for (const c of regionCalls()) {
    if (c.fishable ? c.rating !== ratingFor(c.score) || !/^(Go|Best chance)/.test(c.call) : c.rating !== "poor" || !c.call.startsWith("Give")) probs.push(`region ${c.region}: ${c.rating} ${c.score} "${c.call}"`);
    if (/!/.test(c.call)) probs.push(`region ${c.region}: punctuation "${c.call}"`);
    probs.push(...copyProbs(`region ${c.region}`, c.call));
  }
  let fresh = 0, also = 0, until = 0, emails = 0, filtered = 0, capped = 0, capCands = 0;
  const versions = new Map<string, number>();
  const today = nzTodayISO();
  for (const f0 of allForecasts()) {
    if (listsAllWindows(f0)) fresh++;
    if (f0.data_status === "engine") versions.set(f0.engine_version ?? "none", (versions.get(f0.engine_version ?? "none") ?? 0) + 1);
    probs.push(...f0.windows.flatMap((w) => rangeProbs(`window ${f0.spot.id} ${w.start}`, `${w.headline} ${w.advice}`)), ...f0.days.flatMap((d) => rangeProbs(`day ${f0.spot.id} ${d.date}`, d.summary)), ...rangeProbs(`verdict ${f0.spot.id}`, `${f0.verdict.headline} ${f0.verdict.advice}`));
    // port names: shown form has no spaced hyphen; raw LINZ name only in tide_port_linz_name
    for (const [k, v] of [["tide_port", f0.spot.tide_port], ["tide_source", f0.tide_source], ["tide_note", f0.spot.tide_note], ...f0.sources.map((x) => ["sources", x] as const)] as const) if (v && / - /.test(v)) probs.push(`spot ${f0.spot.id}: ${k} still has a spaced hyphen "${v}"`);
    if (f0.spot.coastal && f0.tide_source && /\)\s*\(/.test(tideSourceText(f0.tide_source, f0.spot.tide_port_km))) probs.push(`spot ${f0.spot.id}: stacked brackets in tides text`);
    probs.push(...copyProbs(`verdict ${f0.spot.id}`, f0.verdict.advice), ...f0.windows.flatMap((w) => copyProbs(`window ${f0.spot.id} ${w.start}`, `${w.headline} ${w.advice}`)), ...f0.days.flatMap((d) => copyProbs(`day ${f0.spot.id} ${d.date}`, d.summary)));
    for (const [tag, f] of [["", f0], [" (legacy)", legacy(f0)]] as const) for (const sc of ["day", "horizon"] as const) {
      const c = bestCall(f, sc), id = `spot ${f.spot.id}${tag} ${sc}`;
      if (c.kind === "window" && (c.rating !== ratingFor(c.score) || c.score < 4.5 || Date.parse(c.end!) <= at)) probs.push(`${id}: ${c.rating} ${c.score} ${c.headline}`);
      if (c.kind === "none" && c.also.length) probs.push(`${id}: 'also' without a pick`);
      for (const w of c.also) {
        if (w.start === c.start || w.score < 4.5 || Date.parse(w.end) <= at || w.start.slice(0, 10) !== c.date || !isNearBest(f, w)) probs.push(`${id}: bad 'also' ${w.start} ${w.score}`);
      }
      if (!tag) also += c.also.length;
      probs.push(...copyProbs(id, c.headline));
    }
    // legacy near_best fallback must agree with the engine's flag
    for (const w of f0.windows) if (typeof w.near_best === "boolean" && isNearBest(legacy(f0), stripW(w)!) !== w.near_best) probs.push(`spot ${f0.spot.id}: near_best fallback disagrees at ${w.start}`);
    // today's shown score: score_remaining, else score
    const d = f0.days.find((x) => x.date === today);
    if (d && dayScore(d, today) !== (d.score_remaining ?? d.score)) probs.push(`spot ${f0.spot.id}: today's score`);
    // stale: valid_until when present, else the remaining_from hour (both ways on every forecast)
    if (f0.valid_until) {
      until++;
      if (todayStale(f0, at).stale !== (at >= Date.parse(f0.valid_until))) probs.push(`spot ${f0.spot.id}: stale flag (valid_until)`);
      if (d?.remaining_from && Date.parse(f0.valid_until) !== Date.parse(d.remaining_from) + 36e5) probs.push(`spot ${f0.spot.id}: valid_until is not remaining_from + 1 h`);
    }
    // fallback: same output without valid_until must use remaining_from, and (for 2.3) agree with valid_until
    const nv = { ...f0, valid_until: undefined };
    if (d?.remaining_from && todayStale(nv, at).stale !== (Math.floor(at / 36e5) * 36e5 > Date.parse(d.remaining_from))) probs.push(`spot ${f0.spot.id}: stale flag (remaining_from)`);
    if (d?.remaining_from && f0.valid_until && todayStale(nv, at).stale !== todayStale(f0, at).stale) probs.push(`spot ${f0.spot.id}: valid_until and remaining_from disagree`);
    if (d?.remaining_from && f0.valid_until && Date.parse(todayStale(nv, at).until!) !== Date.parse(f0.valid_until)) probs.push(`spot ${f0.spot.id}: fallback 'due at' time differs from valid_until`);
    // time filter: the alert pick sits inside the chosen times, scores >= 4.5, is 1-2 days ahead, and is the
    // bestCall pick among exactly those windows (no fitting window -> no alert)
    for (const times of TIME_SETS) {
      const c = alertCall(f0, times), id = `alert ${f0.spot.id} [${times}]`, dates = new Set(alertDates(today));
      const fit = f0.windows.filter((w) => Date.parse(w.end) > at && w.score >= 4.5 && dates.has(w.start.slice(0, 10)) && fitsTimes(w.start, w.end, times));
      const want = pickOf(fit, f0.verdict.window?.start);
      if ((c.start ?? null) !== (want?.start ?? null)) probs.push(`${id}: picked ${c.start} want ${want?.start}`);
      if (c.kind === "window" && !fitsTimes(c.start!, c.end!, times)) probs.push(`${id}: window ${c.start} outside the chosen times`);
      if (times[0] === "any" && c.start !== bestCall(f0, "horizon", at, { dates: alertDates(today) }).start) probs.push(`${id}: 'any time' differs from the unfiltered pick`);
      filtered += c.kind === "window" ? 1 : 0;
    }
    // alert email: built from the alert pick (1-2 days ahead, >= 4.5), subject is the answer
    for (const [tag, f] of [["", f0], [" (legacy)", legacy(f0)]] as const) {
      const c = alertCall(f), m = alertEmail(f, c), id = `alert ${f.spot.id}${tag}`;
      const ahead = c.start ? Math.round((Date.parse(c.start.slice(0, 10)) - Date.parse(today)) / 864e5) : 0;
      if (c.kind === "window" && (!m || c.score < 4.5 || ahead < 1 || ahead > 2 || c.source !== "engine")) probs.push(`${id}: bad pick ${c.start} ${c.score} (${ahead} days ahead)`);
      if (c.kind === "none" && m) probs.push(`${id}: email with no window`);
      if (!m) continue;
      if (!tag) emails++;
      const time = c.when.split(" ").pop()!;
      if (m.subject.length > 60) probs.push(`${id}: subject ${m.subject.length} chars "${m.subject}"`);
      if (!m.subject.includes(time) || !m.subject.includes(shortSpot(f.spot.name))) probs.push(`${id}: subject lacks window time or spot "${m.subject}"`);
      if (wordsBeforeButton(m) > 40) probs.push(`${id}: ${wordsBeforeButton(m)} words before the button`);
      if (m.body.length !== 1) probs.push(`${id}: ${m.body.length} body lines, want 1`);
      if (!m.cta.href.endsWith(`/spots/${f.spot.id}`)) probs.push(`${id}: button goes to ${m.cta.href}`);
      probs.push(...emailProbs(id, m), ...rangeProbs(id, `${m.subject} ${m.body.join(" ")}`));
    }
  }
  // alert cap across every spot (one user who saved them all)
  for (const times of TIME_SETS) {
    const all = allForecasts(), id = `cap [${times}]`;
    const cands = all.map((f) => ({ spot_id: f.spot.id, call: alertCall(f, times, at) })).filter((p) => p.call.kind === "window");
    const plan = planAlerts(all, times, [], at);
    if (plan.length !== Math.min(ALERT_CAP, cands.length)) probs.push(`${id}: ${plan.length} planned from ${cands.length}`);
    const ranked = cands.slice().sort((a, b) => byBest(a.call, b.call)).slice(0, ALERT_CAP).map((p) => `${p.spot_id}@${p.call.start}`);
    if (JSON.stringify(plan.map((p) => `${p.spot_id}@${p.call.start}`)) !== JSON.stringify(ranked)) probs.push(`${id}: not the best ${ALERT_CAP}`);
    for (let i = 1; i < plan.length; i++) if (byBest(plan[i - 1].call, plan[i].call) > 0) probs.push(`${id}: not best first`);
    if (plan.some((p) => p.call.score < 4.5)) probs.push(`${id}: below 4.5`);
    capped += plan.length; capCands = Math.max(capCands, cands.length);
    if (!plan.length) continue;
    // cap full -> nothing; one slot used -> one more, the best remaining
    const sent = sentRows(plan, at - 36e5);
    if (planAlerts(all, times, sent, at).length) probs.push(`${id}: sent past the cap`);
    const one = planAlerts(all, times, sent.slice(0, 1), at);
    if (cands.length > 1 && one.length !== 1) probs.push(`${id}: ${one.length} with one slot left`);
    if (one.some((p) => p.spot_id === plan[0].spot_id && p.call.start === plan[0].call.start)) probs.push(`${id}: same window twice (one slot)`);
    // sent over 7 days ago: room again, but never the same windows
    const old = sentRows(plan, at - (ALERT_CAP_DAYS * 864e5 + 6e4));
    const again = planAlerts(all, times, old, at);
    if (again.some((p) => old.some((o) => o.spot_id === p.spot_id && Date.parse(o.window_start) === Date.parse(p.call.start!)))) probs.push(`${id}: same window twice (after 7 days)`);
    if (again.length !== Math.min(ALERT_CAP, all.filter((f) => alertCall(f, times, at, (w) => !old.some((o) => o.spot_id === f.spot.id && Date.parse(o.window_start) === Date.parse(w.start))).kind === "window").length)) probs.push(`${id}: wrong count after dedupe`);
  }
  const rc = regionCalls();
  console.log(`${t}: ${probs.length} problems; ${rc.length} regions; ${fresh} forecasts with the new window fields; ${until} with valid_until; ${emails} alert emails (default times); ${filtered} alerts across ${TIME_SETS.length} time choices; cap: ${capped} planned (max ${capCands} candidates per choice, cap ${ALERT_CAP}); ${also} 'also worth a look' windows; engine versions ${[...versions].map(([v, n]) => `${v}×${n}`).join(", ")}`);
  if (!times.length || process.env.V) rc.forEach((c) => console.log(`  ${c.region}: ${c.rating} ${c.score} [${c.dayLabel}] ${c.call}`));
  probs.forEach((p) => console.log("  !", p)); bad += probs.length;
}
Date.now = real;
process.exit(bad ? 1 : 0);
