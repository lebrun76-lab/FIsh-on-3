// What the payment setup is on this copy, for the banner and the pricing note. Server side only.
import { stripeMode } from "./stripe";
export type PaymentMode = "test" | "mock" | "refused";
/** "refused": a live key is set, so stripe.ts won't run any payment (and nothing is charged). */
export function paymentMode(): PaymentMode {
  try { return stripeMode(); } catch { return "refused"; }
}
