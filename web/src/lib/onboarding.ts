// Sign-up nudges and the first-run "where do you fish" step.
// Signed-out visitors go /signin?next=..&save=..; every sign-in then lands on /welcome, which saves the
// spot they tapped (if any), or asks for their home spot when they have none, then carries on to next.
export const safeNext = (n: string | null | undefined, fallback = "/") => (n && n.startsWith("/") && !n.startsWith("//") ? n : fallback);
export const safeSpotId = (id: string | null | undefined) => (id && /^[a-z0-9_-]{1,64}$/i.test(id) ? id : null);
const qs = (next: string, save?: string | null) => `next=${encodeURIComponent(next)}${save ? `&save=${encodeURIComponent(save)}` : ""}`;
export const signupHref = (next = "/", save?: string | null) => `/signin?${qs(next, save)}`;
export const welcomeHref = (next = "/", save?: string | null) => `/welcome?${qs(next, save)}`;
/** Most spots the welcome step lets a paid user pick at once. Free is held to FREE_FAV_LIMIT. */
export const WELCOME_MAX = 5;
