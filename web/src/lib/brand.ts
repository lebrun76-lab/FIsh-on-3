// Brand: Salt Supply Co. (picked by Alex, 26 Oct 2026). The only domain is saltsupply.co.nz.
// contact is a real mailbox (admin@, forwards to Alex). hello and alerts are still EXAMPLE placeholders.
export const BRAND = {
  name: "Salt Supply Co.",
  shortName: "Salt Supply",
  domain: "saltsupply.co.nz",
  url: "https://saltsupply.co.nz",
  emails: { contact: "admin@saltsupply.co.nz", hello: "hello@saltsupply.co.nz", alerts: "alerts@saltsupply.co.nz" }, // hello, alerts: examples only
  tagline: "Is it worth going out?",
  description: "Know when to fish. New Zealand fishing forecasts: whether it's worth going, when, and where. Wind, swell, tides and local rules.",
  // Pricing chosen by Alex (26 Oct 2026). Stripe test prices: lookup_keys pro_monthly_nzd, pro_yearly_nzd.
  proPriceNzd: 7.99,
  proAnnualNzd: 79.99,
  trialDays: 30, // no card needed; Stripe cancels at trial end if no card was added
};
