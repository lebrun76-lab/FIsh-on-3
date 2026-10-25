# Fish on! 🎣 – NZ Fishing Forecast

Free interactive fishing forecast for New Zealand.

Select your favourite fishing centres, check any dates, get live wind/swell/rain scores and a clear outlook.

## Features
- 23 main NZ fishing centres (North + South Island)
- Multi-select your areas
- Live weather + marine data
- Usability score (0–10)
- Target species for each centre
- Natural language outlook

## Quick Start (local)

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Deploy free public version (Streamlit Community Cloud)

1. Create a free GitHub account if you don’t have one
2. Create a new repository and upload this whole `fishing_app` folder
3. Go to [share.streamlit.io](https://share.streamlit.io)
4. Click “New app”
5. Select your repository, branch `main`, and set Main file path to `app.py`
6. Click Deploy

You’ll get a public link like `https://yourname-fish-on.streamlit.app` that you can share with your mates.

That’s it – completely free.

## Forecast engine 2.1 (preview)

`fishon_engine/` is a standalone forecast engine. Its output is the site's v1 `SpotForecast` contract (see [docs/OUTPUT.md](docs/OUTPUT.md)). It gives hourly and daily scores, up to 3 windows a day plus a verdict, best fishing windows in plain English, wind vs coastline, swell period, LINZ tides, SST, seasonal species, moon/sun, and a shared SQLite cache. See [docs/ENGINE.md](docs/ENGINE.md).

```bash
pip install -e '.[test]'      # or: pip install -r requirements.txt pytest
pytest -q                     # offline
python -m fishon_engine hauraki_gulf kaikoura bluff --days 3 [--hourly] [--json]
```

Note: the free Open-Meteo API is for non-commercial use only. A paid site needs an Open-Meteo API plan (set `OPEN_METEO_API_KEY`).
