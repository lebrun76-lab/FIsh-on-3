"""
Generate natural, excited, angler-style Thursday evening messages
based on the user's selected fishing centres.
"""

import time
from datetime import date, timedelta
from typing import List, Dict, Any, Optional
from regions import FishingCentre, get_centres_by_ids, get_default_selection_for_base, list_all_centres
from weather import fetch_forecast, fetch_marine, summarise_conditions, nz_today


def describe_period(start: Optional[date] = None, end: Optional[date] = None,
                    today: Optional[date] = None) -> str:
    """Plain-English label for a date range, e.g. 'this weekend', 'today', 'Mon 26 – Sun 1 Nov'."""
    today = today or nz_today()
    if start is None or end is None:
        return "over the next few days"
    if start == end:
        if start == today:
            return "today"
        if start == today + timedelta(days=1):
            return "tomorrow"
        return f"on {start:%a %-d %b}"
    # A Sat-Sun range within the coming week
    if start.weekday() == 5 and end == start + timedelta(days=1) and (start - today).days < 14:
        return "this weekend" if (start - today).days < 7 else "next weekend"
    if start == today and (end - start).days == 6:
        return "over the next 7 days"
    if start.month == end.month:
        return f"from {start:%a %-d} to {end:%a %-d %b}"
    return f"from {start:%a %-d %b} to {end:%a %-d %b}"


def get_centre_conditions(centre: FishingCentre, start: Optional[date] = None,
                          end: Optional[date] = None, days: int = 5) -> Dict[str, Any]:
    """Fetch, summarise and score one centre. Never raises."""
    try:
        weather = fetch_forecast(centre.lat, centre.lon, days=days, start=start, end=end)
        marine = {}
        if centre.is_coastal:
            mlat, mlon = centre.marine_point
            marine = fetch_marine(mlat, mlon, days=days, start=start, end=end)
        summary = summarise_conditions(weather, marine, start=start, end=end)
        if "error" in summary:
            return {"centre": centre, "summary": summary, "score": None}
        score = score_spot(summary, is_coastal=centre.is_coastal)
        return {"centre": centre, "summary": summary, "score": score}
    except Exception as e:
        return {"centre": centre, "summary": {"error": str(e)}, "score": None}


def score_spot(summary: Dict[str, Any], is_coastal: bool = True) -> float:
    """
    Simple 0-10 usability score.
    Missing values are treated as neutral (no bonus, no penalty) rather than
    being replaced with bad defaults. Swell is ignored for freshwater spots.
    """
    score = 5.0

    wind = summary.get("avg_wind_kts")
    gust = summary.get("max_gust_kts")
    swell = summary.get("avg_swell_m")
    rain = summary.get("rain_mm_per_day")
    if rain is None:
        rain = (summary.get("total_rain_mm") or 0) / 2  # legacy: totals were over a weekend
    trend = summary.get("pressure_trend", "stable")

    if wind is not None:
        if wind < 8:
            score += 2.5
        elif wind < 12:
            score += 1.5
        elif wind < 18:
            score += 0.5
        elif wind > 25:
            score -= 3
        else:
            score -= 1.5

    if gust is not None and gust > 30:
        score -= 1.5

    if is_coastal and swell is not None:
        if swell < 1.0:
            score += 2.0
        elif swell < 1.5:
            score += 1.0
        elif swell < 2.5:
            score += 0.0
        else:
            score -= 2.0

    # Per-day thresholds (equivalent to the old 2 mm / 10 mm weekend totals)
    if rain < 1:
        score += 1.0
    elif rain > 5:
        score -= 1.5

    if trend == "falling":
        score += 0.8
    elif trend == "rising":
        score += 0.3

    return max(0.0, min(10.0, round(score, 1)))


def generate_message(
    selected_ids: Optional[List[str]] = None,
    home_base: str = "Hawea",
    max_spots: int = 4,
    start: Optional[date] = None,
    end: Optional[date] = None,
    results: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """
    Generate the Thursday-style message.

    - selected_ids: list of centre ids the user has chosen
    - If none provided, falls back to sensible defaults for home_base
    - start/end: date range the message describes (wording follows it)
    - results: already-fetched results from get_centre_conditions(), to avoid refetching
    """
    period = describe_period(start, end)

    if results is None:
        if not selected_ids:
            selected_ids = get_default_selection_for_base(home_base)

        centres = get_centres_by_ids(selected_ids)[:max_spots]
        if not centres:
            centres = get_centres_by_ids(get_default_selection_for_base(home_base))[:max_spots]

        results = []
        for i, centre in enumerate(centres):
            if i > 0:
                time.sleep(1.3)
            results.append(get_centre_conditions(centre, start=start, end=end))

    results = [r for r in results if r.get("score") is not None]
    results.sort(key=lambda x: x["score"], reverse=True)

    if not results or results[0]["score"] < 4.0:
        return (
            f"Looking a bit ordinary across your selected areas {period}. "
            f"Might be a good one to stay local or wait for the next weather window."
        )

    top = results[0]
    centre = top["centre"]
    s = top["summary"]
    score = top["score"]

    # Conditions strings
    wind = s.get("avg_wind_kts")
    if wind is not None and wind < 8:
        wind_str = "light / no wind"
    elif wind is not None:
        wind_str = f"{wind} kn wind"
    else:
        wind_str = "moderate wind"

    swell = s.get("avg_swell_m")
    if swell is not None:
        swell_str = f"{swell}m swell"
    else:
        swell_str = ""

    # Opener
    if score >= 8.0:
        opener = f"{centre.name} is ON {period}!"
    elif score >= 6.5:
        opener = f"{centre.name} is looking solid {period}."
    else:
        opener = f"{centre.name} is worth a look {period}."

    parts = [opener]

    cond = []
    if swell_str:
        cond.append(swell_str)
    cond.append(wind_str)
    if s.get("rain_mm_per_day", 5) < 1.5:
        cond.append("mostly dry")
    parts.append(" + ".join(cond) + ".")

    # Species
    species = centre.species[:4]
    if len(species) >= 2:
        main = f"{species[0]} and {species[1]}"
        extras = species[2:]
        if extras:
            parts.append(
                f"{main} will be the main targets, with a chance of "
                f"{' / '.join(extras)} if you put the hard yards in."
            )
        else:
            parts.append(f"{main} should be the go.")
    else:
        parts.append(f"Target {' / '.join(species)}.")

    # Call to action
    if score >= 7.5:
        parts.append("Pack the bags.")
    elif score >= 6.0:
        parts.append("Looking like a good mission.")
    else:
        parts.append("Keep an eye on the updated forecast closer to the day.")

    # Runners-up
    runners = [r for r in results[1:] if r["score"] >= 6.0]
    if runners:
        names = [r["centre"].name.split(" (")[0].split(" / ")[0] for r in runners[:2]]
        parts.append(f"(Also decent: {', '.join(names)})")

    return " ".join(parts)


def generate_detailed_report(
    selected_ids: Optional[List[str]] = None,
    home_base: str = "Hawea",
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> str:
    """Longer multi-spot report for the app."""
    if not selected_ids:
        selected_ids = get_default_selection_for_base(home_base)

    centres = get_centres_by_ids(selected_ids)
    lines = [f"Fishing outlook {describe_period(start, end)} – your selected areas\n"]

    for i, centre in enumerate(centres):
        if i > 0:
            time.sleep(1.2)
        r = get_centre_conditions(centre, start=start, end=end)
        summary = r["summary"]
        if r["score"] is None:
            lines.append(f"• {centre.name}  →  Could not fetch data ({summary.get('error')})\n")
            continue
        wind = summary.get("avg_wind_kts")
        swell = summary.get("avg_swell_m")
        rain = summary.get("total_rain_mm", 0)
        swell_txt = "n/a (freshwater)" if not centre.is_coastal else (f"~{swell} m" if swell is not None else "–")
        lines.append(f"• {centre.name}  →  {r['score']}/10")
        lines.append(f"  Wind ~{wind if wind is not None else '?'} kn | Swell {swell_txt} | Rain {rain} mm")
        lines.append(f"  Species: {', '.join(centre.species[:5])}")
        lines.append(f"  {centre.notes}\n")

    return "\n".join(lines)


def list_selectable_centres() -> str:
    """Pretty list of all centres for the user to choose from."""
    centres = list_all_centres()
    lines = ["Available fishing centres (use the id to select):\n"]
    current_island = None
    for c in centres:
        if c.island != current_island:
            current_island = c.island
            lines.append(f"\n=== {current_island} Island ===")
        lines.append(f"  {c.id:22}  {c.name}")
    return "\n".join(lines)
