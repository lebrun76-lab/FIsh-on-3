"""Headless screenshots of the FishCast (placeholder) prototype.
Usage: (server running on :3000)  python3 scripts/screenshots.py [out_dir]
Requires: pip install playwright ; uses system Chrome via CHROME env (default /usr/bin/google-chrome)."""
import json, os, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get("BASE", "http://localhost:3000")
OUT = sys.argv[1] if len(sys.argv) > 1 else "/workspace/fish-on-screenshots"
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
os.makedirs(OUT, exist_ok=True)
def state(plan, favs=("hauraki_gulf",)):
    return {"trialEnds": "2026-11-08" if plan == "trial" else None, "user": {"name": "Alex", "email": "alex@example.com"}, "plan": plan,
            "favourites": list(favs), "home": favs[0] if favs else None,
            "alerts": {"enabled": True, "minRating": "good", "days": ["Sat", "Sun"], "sendAt": "18:00"}}
SHOTS = [  # (name, path, auth-state or None)
    ("01-home", "/", None), ("02-spots-list", "/spots", None), ("03-spots-map", "/spots?view=map", None),
    ("04-spot-free-locked", "/spots/hauraki_gulf", state("free")), ("05-spot-pro", "/spots/hauraki_gulf", state("pro")),
    ("06-spot-lake-free", "/spots/southern_lakes", None),
    ("07-where-to-go-free-locked", "/where-to-go", state("free")), ("08-where-to-go-pro", "/where-to-go", state("pro")),
    ("09-rules-map", "/rules", None), ("10-species", "/species", None),
    ("11-saved-free", "/saved", state("free")), ("12-saved-pro", "/saved", state("pro", ("hauraki_gulf", "bay_of_islands", "coromandel"))),
    ("13-pricing", "/pricing", None), ("14-signin", "/signin", None),
    ("15-account-free", "/account", state("free")), ("16-account-trial", "/account?upgraded=1", state("trial")),
    ("17-catch-log-free", "/catch-log", state("free")), ("18-catch-log-pro", "/catch-log", state("pro")),
    ("19-spot-marlborough-pro-closure", "/spots/marlborough_sounds", state("pro")),
    ("20-spot-catlins-pro-secondary-port", "/spots/catlins", state("pro")),
    ("22-spot-dunedin-pro-sst-break", "/spots/dunedin", state("pro")),
    ("23-spot-central-otago-lake-pro", "/spots/central_otago_lakes", state("pro")),
]
if os.environ.get("ONLY"):  # e.g. ONLY=21-mock-fallback BASE=http://localhost:3001
    SHOTS = [(os.environ["ONLY"], os.environ.get("ONLY_PATH", "/spots/hauraki_gulf"), state(os.environ.get("ONLY_PLAN", "free")))]
SIZES = {"mobile": dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True),
         "desktop": dict(viewport={"width": 1440, "height": 900})}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox"])
    for size, opts in SIZES.items():
        for name, path, st in SHOTS:
            ctx = b.new_context(**opts, timezone_id="Pacific/Auckland", locale="en-NZ")
            if st: ctx.add_init_script(f"localStorage.setItem('fishcast-mock-state', {json.dumps(json.dumps(st))})")
            pg = ctx.new_page(); pg.goto(BASE + path, wait_until="networkidle"); pg.wait_for_timeout(700)
            if "map" in path:
                btn = pg.get_by_role("button", name="map")
                if btn.count(): btn.first.click(); pg.wait_for_timeout(300)
            f = f"{OUT}/{size}-{name}.png"; pg.screenshot(path=f, full_page=True); print(f); ctx.close()
    b.close()
