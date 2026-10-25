// Writes the Stripe CLI's TEST-mode key into the gitignored .env.local as STRIPE_TEST_SECRET_KEY,
// without printing it. Optionally reads a webhook signing secret on stdin (from `stripe listen --print-secret`).
//   npx tsx scripts/stripe-env.ts [--project salt-supply] [--webhook-secret-stdin]
// Only ever reads test_mode_api_key. Refuses anything that is not sk_test_/rk_test_.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isLiveKey } from "../src/lib/stripe";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const project = arg("--project") ?? "salt-supply";
const cfgPath = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "stripe", "config.toml");
const lines = fs.readFileSync(cfgPath, "utf8").split("\n");
let section = "", key: string | undefined;
for (const l of lines) {
  const sec = l.match(/^\s*\[(.+)\]\s*$/);
  if (sec) { section = sec[1]; continue; }
  const kv = l.match(/^\s*test_mode_api_key\s*=\s*['"]?([^'"\s]+)['"]?\s*$/);
  if (kv && section === project) key = kv[1];
}
if (!key) throw new Error(`No test_mode_api_key for project ${project} in the Stripe CLI config`);
if (isLiveKey(key) || !/^(sk|rk)_test_/.test(key)) throw new Error("The CLI test_mode_api_key is not a test-mode key; refusing");

const vals: Record<string, string> = { STRIPE_TEST_SECRET_KEY: key };
if (process.argv.includes("--webhook-secret-stdin")) {
  const s = fs.readFileSync(0, "utf8").trim().split(/\s+/).find((x) => x.startsWith("whsec_"));
  if (!s) throw new Error("No whsec_ secret on stdin");
  vals.STRIPE_WEBHOOK_SECRET = s;
}
const file = path.join(__dirname, "..", ".env.local");
const keep = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter((l) => l && !Object.keys(vals).some((k) => l.startsWith(`${k}=`))) : [];
fs.writeFileSync(file, [...keep, ...Object.entries(vals).map(([k, v]) => `${k}=${v}`)].join("\n") + "\n", { mode: 0o600 });
fs.chmodSync(file, 0o600);
console.log(`wrote ${Object.keys(vals).join(", ")} to .env.local (values not shown)`);
