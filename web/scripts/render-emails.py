"""PNG previews of the rendered emails, mobile inbox width. Run after render-emails.ts.
Usage: python3 scripts/render-emails.py [dir]"""
import json, os, sys
from playwright.sync_api import sync_playwright
D = sys.argv[1] if len(sys.argv) > 1 else "/workspace/fish-on-screenshots/emails-v2"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), headless=True, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 390, "height": 700}, device_scale_factor=2)
    for n in json.load(open(f"{D}/index.json")):
        pg.goto(f"file://{D}/{n}.html"); pg.screenshot(path=f"{D}/{n}.png", full_page=True); print(f"{D}/{n}.png")
    b.close()
