// Sending email, server side only. NO RESEND ACCOUNT EXISTS YET.
// RESEND_API_KEY unset: mock mode, emails go to an in-memory outbox and nothing leaves the box.
// With a key: POST https://api.resend.com/emails. The idempotency key makes a retried job run safe.
import { BRAND } from "./brand";
import { renderEmailHtml, type EmailTemplate } from "./emails";

export interface SentEmail { id: string; to: string; subject: string; kind: EmailTemplate["kind"]; idempotencyKey: string; }
const g = globalThis as unknown as { __outbox?: SentEmail[] };
export const mockOutbox = (g.__outbox ??= []);
export const mailMode = () => (process.env.RESEND_API_KEY ? "resend" : "mock");

const text = (t: EmailTemplate) => [...t.body, "", `${t.cta.label}: ${t.cta.href}`, ...(t.more ?? []).map((b) => `${b.label}: ${b.href}`), "", t.footer, `${t.unsubscribe.label}: ${t.unsubscribe.href}`].join("\n");

export async function sendEmail(t: EmailTemplate, to: string, idempotencyKey: string): Promise<SentEmail> {
  if (mailMode() === "mock") {
    const prev = mockOutbox.find((m) => m.idempotencyKey === idempotencyKey); // Resend returns the first send for a reused key
    if (prev) return prev;
    const m = { id: `mock_${mockOutbox.length + 1}`, to, subject: t.subject, kind: t.kind, idempotencyKey };
    mockOutbox.push(m);
    return m;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from: t.from, to: [to], subject: t.subject, html: renderEmailHtml(t), text: text(t), headers: { "List-Unsubscribe": `<${t.unsubscribe.href}>` }, tags: [{ name: "kind", value: t.kind }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Resend ${r.status}: ${j?.message ?? "error"} (${BRAND.domain})`);
  return { id: j.id, to, subject: t.subject, kind: t.kind, idempotencyKey };
}
