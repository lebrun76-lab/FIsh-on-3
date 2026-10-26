#!/usr/bin/env python3
"""Weekly change check for the MPI recreational fishing rules pages behind catch-rules.json.

Not scheduled. Run it by hand (or from a cron you set up) about once a week:

    python3 scripts/check-mpi-rules.py              # fetch live pages, report changes
    python3 scripts/check-mpi-rules.py --update     # same, then save the new state as the baseline
    python3 scripts/check-mpi-rules.py --from-dir DIR [--update]   # use saved HTML (DIR/<slug>.html) instead of fetching

It compares each page's "Last reviewed" date and a SHA-256 of the rules text with
scripts/catch-rules/mpi-pages-state.json. It only reports. It never edits the rules data:
a person reads the page, updates scripts/catch-rules/build.py, and reruns it.

MPI sits behind a bot wall (Incapsula), so plain curl gets blocked. This uses Playwright with
system Chrome (CHROME env var, default /usr/bin/google-chrome).
Exit code: 0 no changes, 1 something changed, 2 a page could not be fetched.
"""
import argparse, hashlib, json, os, re, sys, time
from datetime import datetime, timezone
from html import unescape

BASE = "https://www.mpi.govt.nz/fishing-aquaculture/recreational-fishing/fishing-rules/"
SLUGS = [
    "auckland-kermadec-fishing-rules", "central-fishing-rules", "challenger-fishing-rules",
    "kaikoura-fishing-rules", "south-east-fishing-rules", "southland-fishing-rules",
    "fiordland-marine-area-fishing-rules",
]
HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "catch-rules", "mpi-pages-state.json")


def reviewed(html):
    m = re.search(r'Last reviewed:\s*<time[^>]*datetime="([0-9-]+)"', html)
    return m.group(1) if m else None


def rules_text(html):
    """Visible text from 'Last reviewed' to the page footer, whitespace squashed."""
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    txt = unescape(re.sub(r"(?s)<[^>]+>", " ", html))
    txt = re.sub(r"\s+", " ", txt)
    a = txt.find("Last reviewed")
    if a < 0:
        return None
    txt = txt[a:]
    for stop in ("Was this page helpful", "Back to top", "Subscribe to updates"):
        b = txt.find(stop)
        if b > 0:
            txt = txt[:b]
            break
    return txt.strip()


def fetch_live(slugs):
    from playwright.sync_api import sync_playwright
    out = {}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), headless=True,
                              args=["--disable-blink-features=AutomationControlled"])
        ctx = b.new_context(locale="en-NZ", user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
        pg = ctx.new_page()
        for s in slugs:
            try:
                pg.goto(BASE + s, wait_until="domcontentloaded", timeout=60000)
                pg.wait_for_timeout(6000)
                out[s] = pg.content()
            except Exception as e:  # noqa: BLE001
                print(f"  ! {s}: {e}", file=sys.stderr)
                out[s] = None
            time.sleep(3)
        b.close()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--update", action="store_true", help="save the fetched state as the new baseline")
    ap.add_argument("--from-dir", help="read DIR/<slug>.html instead of fetching")
    a = ap.parse_args()
    old = json.load(open(STATE)) if os.path.exists(STATE) else {"pages": {}}
    pages = {s: (open(os.path.join(a.from_dir, s + ".html")).read() if os.path.exists(os.path.join(a.from_dir, s + ".html")) else None) for s in SLUGS} if a.from_dir else fetch_live(SLUGS)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    new, changed, failed = {}, [], []
    for s in SLUGS:
        html = pages.get(s)
        txt = rules_text(html) if html else None
        if not txt or "incapsula" in (html or "").lower() and "Last reviewed" not in html:
            failed.append(s)
            print(f"FAILED   {s}: no rules text (blocked or layout changed)")
            if s in old["pages"]:
                new[s] = old["pages"][s]
            continue
        cur = {"url": BASE + s, "lastReviewed": reviewed(html), "sha256": hashlib.sha256(txt.encode()).hexdigest(), "chars": len(txt), "checkedAt": now}
        prev = old["pages"].get(s)
        if not prev:
            print(f"NEW      {s}: last reviewed {cur['lastReviewed']}")
            changed.append(s)
        else:
            what = []
            if prev.get("lastReviewed") != cur["lastReviewed"]:
                what.append(f"last reviewed {prev.get('lastReviewed')} -> {cur['lastReviewed']}")
            if prev.get("sha256") != cur["sha256"]:
                what.append(f"text changed ({prev.get('chars')} -> {cur['chars']} chars)")
            print(("CHANGED  " if what else "same     ") + s + (": " + "; ".join(what) if what else f" (last reviewed {cur['lastReviewed']})"))
            if what:
                changed.append(s)
        new[s] = cur
    if changed:
        print("\nRe-read the changed pages, update scripts/catch-rules/build.py, rerun it, and bump CHECKED.")
    if a.update:
        json.dump({"_about": "Baseline for scripts/check-mpi-rules.py. Written with --update.", "pages": new}, open(STATE, "w"), indent=2)
        print(f"Saved baseline to {os.path.relpath(STATE)}")
    sys.exit(2 if failed else 1 if changed else 0)


if __name__ == "__main__":
    main()
