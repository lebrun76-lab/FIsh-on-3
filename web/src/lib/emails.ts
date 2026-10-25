// Email templates (copy only; sending is not wired up in the prototype).
// Five-second read: the alert subject is the answer (day, window, spot, target), then one plain
// sentence on why, then one button. Charts and detail stay on the site.
// Everything comes from engine fields (window, advice, species); nothing is hardcoded.
// From addresses are example placeholders on saltsupply.co.nz; links point at https://saltsupply.co.nz.
import { BRAND } from "./brand";
import { speciesOf } from "./view";
import type { Call } from "./call";
import type { SpotForecast } from "./types";

export interface EmailTemplate {
  kind: "alert" | "welcome" | "trial";
  from: string; subject: string; preheader: string;
  body: string[];                                  // everything above the button
  cta: { label: string; href: string };
  footer: string;
  unsubscribe: { label: string; href: string };
}

const unsubscribe = { label: "Unsubscribe", href: `${BRAND.url}/account?unsubscribe=1` };
const footer = `${BRAND.name}, ${BRAND.domain}. Guidance only: check the MetService marine forecast before you go. Change your spots or times at ${BRAND.domain}/account.`;

/** "Bay of Plenty (Tauranga / Whakatāne)" -> "Bay of Plenty"; "Stewart Island / Rakiura" -> "Stewart Island". */
export const shortSpot = (name: string) => name.split(" (")[0].split(" / ")[0].trim();

/** The engine's target for this window ("Try snapper: ..."), else the first species not closed. */
export function targetOf(f: SpotForecast, advice?: string): string | null {
  const m = advice && /\bTry ([^:.,]+?)(?::|\.|,|$)/i.exec(advice);
  if (m) return m[1].trim().toLowerCase();
  const sp = speciesOf(f).find((x) => x.status !== "closed")?.name ?? f.spot.species[0];
  return sp ? sp.toLowerCase() : null;
}

/** "Mon 8–11am, light NE 2 kn, 0.4 m sea @ 8 s, falling tide. Try snapper: ..." -> "light NE 2 kn, 0.4 m sea, falling tide" */
export function conditionsOf(advice: string): string {
  const first = advice.split(/\. (?=[A-Z])/)[0].replace(/\.$/, "");
  return first.replace(/^[A-Z][a-z]{2} [\d:apm–]+,\s*/, "").replace(/ @ \d+(\.\d+)? s/g, "").trim();
}

/** Alert for the window `c` picked by alertCall(). Null when there's nothing worth sending. */
export function alertEmail(f: SpotForecast, c: Call): EmailTemplate | null {
  if (c.kind !== "window" || !c.window) return null;
  const spot = shortSpot(f.spot.name), target = targetOf(f, c.window.advice);
  const base = `${c.headline}, ${spot}`;
  const subject = target && `${base}, ${target}`.length <= 60 ? `${base}, ${target}` : base;
  const word = c.rating === "marginal" ? "Fishable" : c.rating[0].toUpperCase() + c.rating.slice(1);
  const why = `${word} window (${c.score.toFixed(1)}/10): ${conditionsOf(c.window.advice)}.`;
  return {
    kind: "alert",
    from: `${BRAND.name} alerts <${BRAND.emails.alerts}>`,
    subject,
    preheader: `${word}, ${c.score.toFixed(1)}/10. Detail on the site.`,
    body: [why],
    cta: { label: "See the forecast", href: `${BRAND.url}/spots/${f.spot.id}` },
    footer, unsubscribe,
  };
}

export function welcomeEmail(): EmailTemplate {
  return {
    kind: "welcome",
    from: `${BRAND.name} <${BRAND.emails.hello}>`,
    subject: `Welcome to ${BRAND.name}`,
    preheader: "What you'll get and when.",
    body: [
      "You'll get an email when a saved spot has a good fishing window.",
      "Alerts come 1 to 2 days ahead, only for times you can fish.",
      "Change your spots or times any time on your account page.",
    ],
    cta: { label: "Your account", href: `${BRAND.url}/account` },
    footer, unsubscribe,
  };
}

export function trialEndingEmail(endsOn: string): EmailTemplate {
  return {
    kind: "trial",
    from: `${BRAND.name} <${BRAND.emails.hello}>`,
    subject: `Your ${BRAND.shortName} Pro trial ends ${endsOn}`,
    preheader: "No card on file, so nothing is charged.",
    body: [`Your ${BRAND.trialDays}-day Pro trial ends on ${endsOn}. We don't have a card for you, so nothing is charged and you drop back to Free.`, `Pro is $${BRAND.proPriceNzd}/month or $${BRAND.proAnnualNzd}/year (proposed pricing).`],
    cta: { label: "Keep Pro", href: `${BRAND.url}/pricing` },
    footer, unsubscribe,
  };
}

/** Words a reader meets before the button (the body lines). */
export const wordsBeforeButton = (t: EmailTemplate) => t.body.join(" ").split(/\s+/).filter(Boolean).length;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Plain, inline-styled HTML for email clients and previews. */
export function renderEmailHtml(t: EmailTemplate): string {
  return `<!doctype html><html lang="en-NZ"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.subject)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<div style="display:none;max-height:0;overflow:hidden">${esc(t.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px">
<tr><td style="padding:20px 24px 0;font-size:13px;font-weight:700;color:#0c4a6e">${esc(BRAND.name)}</td></tr>
<tr><td style="padding:12px 24px 0">${t.body.map((p) => `<p style="margin:0 0 10px;font-size:17px;line-height:1.45">${esc(p).replace(/(\d) (kn|m)\b/g, "$1&nbsp;$2")}</p>`).join("")}</td></tr>
<tr><td style="padding:8px 24px 20px"><a href="${esc(t.cta.href)}" style="display:inline-block;background:#0c4a6e;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:12px 22px;border-radius:999px">${esc(t.cta.label)}</a></td></tr>
<tr><td style="padding:14px 24px 20px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">${esc(t.footer)} <a href="${esc(t.unsubscribe.href)}" style="color:#64748b">${esc(t.unsubscribe.label)}</a></td></tr>
</table></td></tr></table></body></html>`;
}
