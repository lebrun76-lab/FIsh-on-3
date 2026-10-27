// Vercel Cron calls GET with "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set on the
// project. Anything else gets 401, so nobody can trigger a job from outside.
import crypto from "node:crypto";
import { NextResponse } from "next/server";

export function cronAuthError(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const got = Buffer.from(req.headers.get("authorization") ?? ""), want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  return null;
}

/** The jobs aren't scheduled yet (vercel.json has no crons). Until they are wired to the database, say so. */
export const notScheduled = (job: string, logic: string) =>
  NextResponse.json({ job, scheduled: false, sent: 0, note: `Not switched on for the demo. The rules are in ${logic}; the database read and send loop still needs writing. See docs/demo-deploy.md.` });
