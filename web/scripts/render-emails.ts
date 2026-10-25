// Render the emails to HTML (and PNG via scripts/render-emails.py) for review.
// Run: npx tsx scripts/render-emails.ts [out_dir]   (default /workspace/fish-on-screenshots/emails-v2)
import { mkdirSync, writeFileSync } from "node:fs";
import { allForecasts } from "../src/lib/forecasts";
import { alertCall } from "../src/lib/call";
import { alertEmail, renderEmailHtml, trialEndingEmail, welcomeEmail, wordsBeforeButton, type EmailTemplate } from "../src/lib/emails";
const out = process.argv[2] ?? "/workspace/fish-on-screenshots/emails-v2";
mkdirSync(out, { recursive: true });
const write = (name: string, m: EmailTemplate) => {
  const html = renderEmailHtml(m);
  writeFileSync(`${out}/${name}.html`, html);
  // Review copy: an inbox row (sender, subject, preheader) above the email, as a phone shows it.
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const row = `<div style="background:#fff;border-bottom:1px solid #e2e8f0;padding:12px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif"><div style="font-size:13px;color:#475569">${esc(m.from)}</div><div style="font-size:16px;font-weight:700;color:#0f172a">${esc(m.subject)}</div><div style="font-size:14px;color:#64748b">${esc(m.preheader)}</div></div>`;
  writeFileSync(`${out}/${name}-inbox.html`, html.replace(/(<body[^>]*>)/, `$1${row}`));
  console.log(`${out}/${name}.html  [${m.subject.length} chars] ${m.subject}  | ${wordsBeforeButton(m)} words before the button | preheader: ${m.preheader}`);
};
const wanted = (process.env.SPOTS ?? "bay_of_islands,hauraki_gulf,wellington,central_otago_lakes").split(",");
const index: string[] = [];
for (const f of allForecasts().filter((x) => wanted.includes(x.spot.id))) {
  const m = alertEmail(f, alertCall(f));
  if (m) { write(`alert-${f.spot.id}`, m); index.push(`alert-${f.spot.id}-inbox`); } else console.log(`${f.spot.id}: no alert (no fishable window 1 to 2 days ahead)`);
}
write("welcome", welcomeEmail()); write("trial-ending", trialEndingEmail("Sun 8 Nov")); index.push("welcome-inbox", "trial-ending-inbox");
writeFileSync(`${out}/index.json`, JSON.stringify(index));
