// Email templates (copy only; sending is not wired up in the prototype).
// From addresses are example placeholders on saltsupply.co.nz; links point at https://saltsupply.co.nz.
import { BRAND } from "./brand";

export interface EmailTemplate { from: string; subject: string; preheader: string; body: string[]; cta: { label: string; href: string }; footer: string }

const footer = `${BRAND.name} · ${BRAND.domain} · Forecasts are guidance only; always check the MetService marine forecast. Unsubscribe · Change alert settings: ${BRAND.url}/account`;

export function alertEmail(name: string, spot = "Hauraki Gulf", spotId = "hauraki_gulf"): EmailTemplate {
  return {
    from: `${BRAND.name} alerts <${BRAND.emails.alerts}>`,
    subject: `${spot} is on Saturday morning`,
    preheader: "Saturday 6–10am looks great: light wind, small swell.",
    body: [`Kia ora ${name},`, `Saturday 6–10am looks great at ${spot}: light wind 4–7 kn, small swell ~0.4 m, high tide 8:10am. Get there early and fish the top of the tide.`],
    cta: { label: "See the forecast →", href: `${BRAND.url}/spots/${spotId}` },
    footer,
  };
}

export function welcomeEmail(name: string): EmailTemplate {
  return {
    from: `${BRAND.name} <${BRAND.emails.hello}>`,
    subject: `Welcome to ${BRAND.name}`,
    preheader: "Save a spot and we'll tell you when it's worth going.",
    body: [`Kia ora ${name},`, `Thanks for signing up. Save your home spot and we'll tell you straight: go, maybe, or give it a miss.`, "Free gives you today's call for one saved spot. Pro adds the 10-day outlook, every fishing window and email alerts."],
    cta: { label: "Pick your spot →", href: `${BRAND.url}/spots` },
    footer,
  };
}

export function trialEndingEmail(name: string, endsOn: string): EmailTemplate {
  return {
    from: `${BRAND.name} <${BRAND.emails.hello}>`,
    subject: `Your ${BRAND.shortName} Pro trial ends ${endsOn}`,
    preheader: "No card on file, so nothing will be charged.",
    body: [`Kia ora ${name},`, `Your ${BRAND.trialDays}-day Pro trial ends on ${endsOn}. We don't have a card for you, so nothing will be charged. You'll simply drop back to Free.`, `To keep the 10-day outlook and alerts, Pro is $${BRAND.proPriceNzd}/month or $${BRAND.proAnnualNzd}/year (proposed pricing).`],
    cta: { label: "Keep Pro →", href: `${BRAND.url}/pricing` },
    footer,
  };
}
