"""Timezone helpers. Everything user-facing is Pacific/Auckland."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

NZ = ZoneInfo("Pacific/Auckland")
UTC = timezone.utc


def now_nz() -> datetime:
    return datetime.now(NZ)


def today_nz() -> date:
    return now_nz().date()


def utc_unix_to_nz(ts: int) -> datetime:
    """Open-Meteo is queried with timeformat=unixtime, so each hour is an
    unambiguous UTC instant. Converting here avoids the DST bugs you get from
    naive local ISO strings (missing 2am in late September, duplicated 2am in
    early April)."""
    return datetime.fromtimestamp(ts, tz=UTC).astimezone(NZ)


def fmt_hour(dt: datetime) -> str:
    """6am, 10am, 12pm, 3:30pm (minutes only when non-zero)."""
    h = dt.hour % 12 or 12
    suffix = "am" if dt.hour < 12 else "pm"
    return f"{h}{suffix}" if dt.minute == 0 else f"{h}:{dt.minute:02d}{suffix}"


def fmt_range(start: datetime, end: datetime) -> str:
    """'Sat 6–10am' or 'Sat 11am–2pm' (unspaced en dash, as the site shows)."""
    s, e = fmt_hour(start), fmt_hour(end)
    if s[-2:] == e[-2:]:
        s = s[:-2]
    return f"{start.strftime('%a')} {s}\u2013{e}"


def day_label(d: date) -> str:
    return d.strftime("%a %-d %b")


__all__ = ["NZ", "UTC", "now_nz", "today_nz", "utc_unix_to_nz", "fmt_hour",
           "fmt_range", "day_label", "timedelta"]
