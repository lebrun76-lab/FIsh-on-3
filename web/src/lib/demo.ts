// Demo mode: the banner, noindex (robots meta, robots.txt, X-Robots-Tag) and test-mode payments.
// It is on for every deploy for now: live Stripe payments aren't built and stripe.ts refuses live
// keys, so there is no "real" mode to switch to yet. When there is, make this read an env var and
// require a live key, rather than letting a test-mode copy go out without the banner.
export const demoMode = (): boolean => true;
