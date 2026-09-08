"""
Generate natural, excited, angler-style Thursday evening messages
based on the user's selected fishing centres.
"""

import time
from typing import List, Dict, Any, Optional
from regions import FishingCentre, get_centres_by_ids, get_default_selection_for_base, list_all_centres
from weather import fetch_forecast, fetch_marine, summarise_conditions


def score_spot(summary: Dict[str, Any], is_coastal: bool = True) -> float:
    """Simple 0-10 usability score."""
    score = 5.0

    wind = summary.get("avg_wind_kts") or 20
    gust = summary.get("max_gust_kts") or 30
    swell = summary.get("avg_swell_m")
    rain = summary.get("total_rain_mm") or 0
    trend = summary.get("pressure_trend", "stable")

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

    if gust > 30:
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

    if rain < 2:
        score += 1.0
    elif rain > 10:
        score -= 1.5

    if trend == "falling":
        score += 0.8
    elif trend == "rising":
        score += 0.3

    return max(0.0, min(10.0, round(score, 1)))


def generate_message(
    selected_ids: Optional[List[str]] = None,
    home_base: str = "Hawea",
    max_spots: int = 4
) -> str:
    """
    Generate the Thursday-style message.
    
    - selected_ids: list of centre ids the user has chosen
    - If none provided, falls back to sensible defaults for home_base
    """
    if not selected_ids:
        selected_ids = get_default_selection_for_base(home_base)

    centres = get_centres_by_ids(selected_ids)[:max_spots]
    if not centres:
        centres = get_centres_by_ids(get_default_selection_for_base(home_base))[:max_spots]

    results = []
    for i, centre in enumerate(centres):
        try:
            if i > 0:
                time.sleep(1.3)
            weather = fetch_forecast(centre.lat, centre.lon, days=5)
            marine = fetch_marine(centre.lat, centre.lon, days=5)
            summary = summarise_conditions(weather, marine)
            is_coastal = "freshwater" not in centre.tags
            score = score_spot(summary, is_coastal=is_coastal)
            results.append({
                "centre": centre,
                "summary": summary,
                "score": score
            })
        except Exception as e:
            results.append({
                "centre": centre,
                "summary": {"error": str(e)},
                "score": 0.0
            })

    results.sort(key=lambda x: x["score"], reverse=True)

    if not results or results[0]["score"] < 4.0:
        return (
            f"Looking a bit ordinary across your selected areas this weekend. "
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
        opener = f"{centre.name} is ON this weekend!"
    elif score >= 6.5:
        opener = f"{centre.name} is looking solid this weekend."
    else:
        opener = f"{centre.name} is worth a look this weekend."

    parts = [opener]

    cond = []
    if swell_str:
        cond.append(swell_str)
    cond.append(wind_str)
    if s.get("total_rain_mm", 5) < 3:
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
        parts.append("Keep an eye on the updated forecast Friday.")

    # Runners-up
    runners = [r for r in results[1:] if r["score"] >= 6.0]
    if runners:
        names = [r["centre"].name.split(" / ")[0] for r in runners[:2]]
        parts.append(f"(Also decent: {', '.join(names)})")

    return " ".join(parts)


def generate_detailed_report(
    selected_ids: Optional[List[str]] = None,
    home_base: str = "Hawea"
) -> str:
    """Longer multi-spot report for the app."""
    if not selected_ids:
        selected_ids = get_default_selection_for_base(home_base)

    centres = get_centres_by_ids(selected_ids)
    lines = [f"Weekend fishing outlook – your selected areas\n"]

    for i, centre in enumerate(centres):
        try:
            if i > 0:
                time.sleep(1.2)
            weather = fetch_forecast(centre.lat, centre.lon, days=5)
            marine = fetch_marine(centre.lat, centre.lon, days=5)
            summary = summarise_conditions(weather, marine)
            is_coastal = "freshwater" not in centre.tags
            score = score_spot(summary, is_coastal=is_coastal)

            wind = summary.get("avg_wind_kts", "?")
            swell = summary.get("avg_swell_m", "–")
            rain = summary.get("total_rain_mm", 0)

            lines.append(f"• {centre.name}  →  {score}/10")
            lines.append(f"  Wind ~{wind} kn | Swell ~{swell} m | Rain {rain} mm")
            lines.append(f"  Species: {', '.join(centre.species[:5])}")
            lines.append(f"  {centre.notes}\n")
        except Exception as e:
            lines.append(f"• {centre.name}  →  Could not fetch data ({e})\n")

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
