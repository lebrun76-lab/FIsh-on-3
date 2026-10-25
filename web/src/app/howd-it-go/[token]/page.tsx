import type { Metadata } from "next";
import { OUTCOMES, OUTCOME_LABEL, feedbackStore, isOutcome, viewFor, type Outcome } from "@/lib/feedback";
import { nzWindowLabel, shortSpot } from "@/lib/emails";
// The page behind the "How'd it go?" email buttons. GET is read only: it shows a confirm button and
// nothing is saved until that is tapped (POST /api/howd-it-go). Works without sign-in.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "How'd it go?", robots: { index: false, follow: false } };

const nzDay = (t: number) => new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", weekday: "short", day: "numeric", month: "short" }).format(new Date(t)).replace(",", "");
const btn = "w-full rounded-2xl py-3 font-semibold";
const Answer = ({ token, o, main }: { token: string; o: Outcome; main?: boolean }) => (
  <form method="post" action="/api/howd-it-go"><input type="hidden" name="token" value={token} /><input type="hidden" name="o" value={o} />
    <button className={`${btn} ${main ? "bg-ocean-900 text-white" : "bg-white text-ocean-900 ring-2 ring-ocean-900"}`}>{main ? "Yes, save it" : OUTCOME_LABEL[o]}</button></form>
);
const ERR: Record<string, string> = { bad: "This link doesn't work. Use the buttons in the email.", expired: "This link has expired. Answers close 14 days after the email.", gone: "We can't find that alert any more.", locked: "Answers can be changed for 7 days. This one is locked in now.", not_caught: "Pick \"Caught something\" first.", bad_outcome: "Pick one of the answers." };

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params, q = await searchParams;
  const v = await viewFor(decodeURIComponent(token), feedbackStore());
  const shell = (body: React.ReactNode) => <div className="mx-auto max-w-md space-y-4 pt-6">{body}</div>;
  if (v.state !== "ok") return shell(<><h1 className="text-2xl font-bold">How&apos;d it go?</h1><p className="text-slate-600">{ERR[v.state]}</p></>);
  const a = v.alert!, where = shortSpot(v.spot!), when = nzWindowLabel(a.window_start, a.window_end), f = v.feedback;
  const head = <p className="text-sm text-slate-500">{where}, {when}</p>;
  const error = q.error && ERR[q.error] ? <p className="rounded-xl bg-yellow-50 p-3 text-sm text-yellow-900 ring-1 ring-yellow-200">{ERR[q.error]}</p> : null;

  if (q.saved === "species" && f?.outcome === "caught" && v.canChange) return shell(<>
    {head}<h1 className="text-2xl font-bold">Saved. What was it?</h1><p className="text-slate-600">Optional. Pick any that apply.</p>
    <form method="post" action="/api/howd-it-go" className="space-y-4"><input type="hidden" name="token" value={token} /><input type="hidden" name="step" value="species" />
      <div className="flex flex-wrap gap-2">{v.species.map((s) => <label key={s} className="cursor-pointer"><input type="checkbox" name="species" value={s} defaultChecked={f.species.includes(s)} className="peer sr-only" /><span className="inline-block rounded-full bg-white px-4 py-2 text-sm font-medium ring-1 ring-slate-300 peer-checked:bg-ocean-900 peer-checked:text-white peer-checked:ring-ocean-900">{s}</span></label>)}</div>
      <button className={`${btn} bg-ocean-900 text-white`}>Save species</button>
      <button name="skip" value="1" className="w-full py-2 text-sm font-medium text-slate-600 underline">Skip</button>
    </form></>);

  const pick = isOutcome(q.o) ? q.o : null;
  if (pick && !(f && f.outcome === pick && !q.saved) && v.canChange) return shell(<>
    {head}{error}<h1 className="text-2xl font-bold">{OUTCOME_LABEL[pick]}?</h1>
    <p className="text-slate-600">{f ? `You said ${OUTCOME_LABEL[f.outcome].toLowerCase()}. Tap to change it.` : "One tap to save it. No sign-in needed."}</p>
    <Answer token={token} o={pick} main />
    <p className="pt-2 text-sm text-slate-500">Not right? <a className="underline" href={`?o=${OUTCOMES.find((x) => x !== pick)}`}>{OUTCOME_LABEL[OUTCOMES.find((x) => x !== pick)!]}</a> or <a className="underline" href={`?o=${OUTCOMES.filter((x) => x !== pick)[1]}`}>{OUTCOME_LABEL[OUTCOMES.filter((x) => x !== pick)[1]]}</a></p>
  </>);

  if (f) return shell(<>
    {head}{error}<h1 className="text-2xl font-bold">Saved: {OUTCOME_LABEL[f.outcome].toLowerCase()}{f.species.length ? ` (${f.species.join(", ").toLowerCase()})` : ""}.</h1>
    <p className="text-slate-600">Cheers. It helps the forecasts.</p>
    {v.canChange && <><p className="text-sm text-slate-500">You can change it until {nzDay(v.changeUntil!)}.</p>
      <div className="space-y-2">{OUTCOMES.filter((o) => o !== f.outcome).map((o) => <Answer key={o} token={token} o={o} />)}</div>
      {f.outcome === "caught" && <a className="block text-center text-sm underline text-slate-600" href="?saved=species">Change species</a>}</>}
  </>);

  return shell(<>{head}{error}<h1 className="text-2xl font-bold">How&apos;d it go?</h1><p className="text-slate-600">One tap. No sign-in needed.</p>
    <div className="space-y-2">{OUTCOMES.map((o) => <form key={o} method="post" action="/api/howd-it-go"><input type="hidden" name="token" value={token} /><input type="hidden" name="o" value={o} /><button className={`${btn} ${o === "caught" ? "bg-ocean-900 text-white" : "bg-white text-ocean-900 ring-2 ring-ocean-900"}`}>{OUTCOME_LABEL[o]}</button></form>)}</div></>);
}
