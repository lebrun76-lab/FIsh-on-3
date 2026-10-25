"""
Salt Supply Co: NZ Fishing Forecast
Interactive web app: select centres, check any dates, get live conditions.
"""

import streamlit as st
import time
from datetime import datetime, timedelta
import zoneinfo
from typing import List

# Flat imports (works on Streamlit Cloud)
from regions import (
    list_all_centres,
    get_centres_by_ids,
    get_default_selection_for_base,
    FishingCentre,
)
from weather import clamp_date_range, MAX_FORECAST_DAYS
from messenger import get_centre_conditions, generate_message, describe_period

# ------------------------------------------------------------
# Page config
# ------------------------------------------------------------
st.set_page_config(
    page_title="Salt Supply Co: NZ Fishing Forecast",
    page_icon="🎣",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
@st.cache_data(ttl=1800)
def get_conditions(centre_id: str, start, end):
    """Cached per centre + date range."""
    centre = get_centres_by_ids([centre_id])[0]
    return get_centre_conditions(centre, start=start, end=end)


def score_colour(score) -> str:
    if score is None:
        return "⚪"
    if score >= 8:
        return "🟢"
    if score >= 6.5:
        return "🟡"
    if score >= 4.5:
        return "🟠"
    return "🔴"


# ------------------------------------------------------------
# Sidebar
# ------------------------------------------------------------
st.sidebar.title("🎣 Salt Supply Co")
st.sidebar.markdown("Select the areas you care about and check any day.")

home_base = st.sidebar.text_input("Your home base (optional)", value="Hawea")

all_centres = list_all_centres()
north = [c for c in all_centres if c.island == "North"]
south = [c for c in all_centres if c.island == "South"]

st.sidebar.markdown("### Select your fishing centres")

default_ids = get_default_selection_for_base(home_base)

def format_centre(c: FishingCentre) -> str:
    return f"{c.name} ({c.region})"

selected_north = st.sidebar.multiselect(
    "North Island",
    options=north,
    default=[c for c in north if c.id in default_ids],
    format_func=format_centre,
)

selected_south = st.sidebar.multiselect(
    "South Island",
    options=south,
    default=[c for c in south if c.id in default_ids],
    format_func=format_centre,
)

selected_centres: List[FishingCentre] = selected_north + selected_south
selected_ids = [c.id for c in selected_centres]

st.sidebar.markdown("### Date range")
today = datetime.now(zoneinfo.ZoneInfo("Pacific/Auckland")).date()
col1, col2 = st.sidebar.columns(2)
max_date = today + timedelta(days=MAX_FORECAST_DAYS - 1)
start_date = col1.date_input("From", value=today, min_value=today, max_value=max_date)
end_date = col2.date_input("To", value=today + timedelta(days=6), min_value=today, max_value=max_date)

start_date, end_date, range_notes = clamp_date_range(start_date, end_date, today=today)
for note in range_notes:
    st.sidebar.caption(f"ℹ️ {note}")

# ------------------------------------------------------------
# Main
# ------------------------------------------------------------
st.title("🎣 Salt Supply Co")
st.caption("Live conditions + usability scores for the centres you care about")

if not selected_centres:
    st.warning("Select at least one fishing centre in the sidebar to get started.")
    st.stop()

results = []
progress = st.progress(0, text="Fetching live data...")

for i, centre in enumerate(selected_centres):
    progress.progress((i + 1) / len(selected_centres), text=f"Checking {centre.name}...")
    results.append(get_conditions(centre.id, start_date, end_date))

progress.empty()

st.subheader(f"Quick outlook, {start_date:%a %-d %b} to {end_date:%a %-d %b}")
try:
    msg = generate_message(results=results, start=start_date, end=end_date)
    st.success(msg)
except Exception:
    st.info("Could not generate summary right now. The detailed cards below still work.")

st.divider()

st.subheader("Detailed conditions")

results.sort(key=lambda x: -1 if x["score"] is None else x["score"], reverse=True)

for r in results:
    centre = r["centre"]
    summary = r["summary"]
    score = r["score"]

    with st.container():
        col_a, col_b = st.columns([3, 1])
        with col_a:
            st.markdown(f"### {score_colour(score)} {centre.name}")
            st.caption(f"{centre.region} · {centre.island} Island")
        with col_b:
            st.metric("Score", f"{score}/10" if score is not None else "n/a")

        if "error" in summary:
            st.error(f"Could not load data: {summary['error']}")
        else:
            m1, m2, m3, m4 = st.columns(4)
            wind = summary.get("avg_wind_kts")
            m1.metric("Avg Wind", f"{wind} kn" if wind is not None else "n/a")
            gust = summary.get("max_gust_kts")
            m2.metric("Max Gust", f"{gust} kn" if gust is not None else "n/a")
            swell = summary.get("avg_swell_m")
            if not centre.is_coastal:
                m3.metric("Avg Swell", "n/a", help="Freshwater, so swell is not applicable")
            else:
                m3.metric("Avg Swell", f"{swell} m" if swell is not None else "n/a")
            rain = summary.get("total_rain_mm", 0)
            m4.metric("Rain (period)", f"{rain} mm")

            st.markdown(f"**Target species:** {', '.join(centre.species)}")
            st.markdown(f"*{centre.notes}*")

            if score >= 8:
                st.success("Excellent window. Get out there if you can.")
            elif score >= 6.5:
                st.info("Solid conditions. Worth the mission.")
            elif score >= 4.5:
                st.warning("Marginal. Pick your times carefully.")
            else:
                st.error("Poor window. Try another area or wait.")

        st.divider()

st.markdown("---")
st.caption(
    "Data: Open-Meteo (weather + marine) · Scores are heuristic based on wind, swell, rain & pressure. "
    "Always check official marine forecasts and local conditions before heading out."
)
