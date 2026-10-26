"""GET/POST /api/refresh_forecasts - rerun Forecast Brain for every spot and store it in Supabase.

Auth: "Authorization: Bearer <secret>" where secret is FORECAST_REFRESH_SECRET (used by the
Supabase pg_cron job) or CRON_SECRET (Vercel Cron backup, manual runs). Anything else gets 401.
Query: ?force=1 ignores the 45-minute gap between runs; ?sst=yes|no|auto; ?dry=1 only checks the
bundle (imports the engine, no network). After a run it asks the Next.js app to revalidate
(/api/cron/revalidate-forecasts) so pages pick the new rows up without a redeploy.
"""
import hmac
import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pyjob"))


def _authorised(header: str) -> bool:
    for name in ("FORECAST_REFRESH_SECRET", "CRON_SECRET"):
        secret = os.environ.get(name)
        if secret and hmac.compare_digest(header.encode(), f"Bearer {secret}".encode()):
            return True
    return False


def _revalidate(host: str) -> str:
    import requests
    secret = os.environ.get("CRON_SECRET")
    if not secret:
        return "skipped: CRON_SECRET not set"
    site = os.environ.get("SITE_URL") or (
        "https://" + os.environ["VERCEL_PROJECT_PRODUCTION_URL"]
        if os.environ.get("VERCEL_ENV") == "production" and os.environ.get("VERCEL_PROJECT_PRODUCTION_URL")
        else f"https://{host}")
    try:
        r = requests.post(site.rstrip("/") + "/api/cron/revalidate-forecasts",
                          headers={"Authorization": f"Bearer {secret}"}, timeout=20)
        return f"{r.status_code}"
    except Exception as e:
        return f"error: {type(e).__name__}"


class handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        data = json.dumps(body, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _run(self):
        if not _authorised(self.headers.get("authorization", "")):
            return self._send(401, {"error": "unauthorised"})
        q = {k: v[-1] for k, v in parse_qs(urlparse(self.path).query).items()}
        try:
            import refresh
            if q.get("dry") == "1":
                return self._send(200, {"dry": True, "engine_version": refresh.fe.__version__,
                                        "mapper_version": refresh.MAPPER_VERSION, "spots": len(refresh.fe.SPOTS),
                                        "python": sys.version.split()[0]})
            trigger = "vercel-cron" if "vercel-cron" in self.headers.get("user-agent", "") else q.get("trigger", "http")
            out = refresh.run(force=q.get("force") == "1", trigger=trigger, sst=q.get("sst", "auto"))
            if not out.get("skipped") and (out.get("spots_ok") or (out.get("sst_map") or {}).get("valid_time_nz")):
                out["revalidate"] = _revalidate(self.headers.get("x-forwarded-host") or self.headers.get("host", ""))
            return self._send(200 if out.get("skipped") or out.get("status") != "failed" else 502, out)
        except Exception as e:
            traceback.print_exc()
            return self._send(500, {"error": f"{type(e).__name__}: {str(e)[:300]}"})

    def do_GET(self):
        self._run()

    def do_POST(self):
        self._run()
