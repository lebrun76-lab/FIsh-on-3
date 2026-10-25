# Confidence (PR D item 6)

Engine 2.1 confidence was lead time only. From 2.2, each window's confidence also uses **model agreement** and **data gaps**. Code: `fishon_engine/confidence.py`; tests: `tests/test_confidence.py`, `tests/test_v1_real.py::test_real_confidence_uses_model_agreement`.

## Method

1. **Lead level** (unchanged from 2.1): day 0–2 `high`, 3–6 `medium`, 7+ `low`.
2. **Model agreement.** Each window is re-scored hour by hour with the normal scoring function, swapping in one comparison model at a time:
   - wind speed, gust and direction from **ECMWF IFS 0.25° (`ecmwf_ifs025`), GFS (`gfs_seamless`), ICON (`icon_seamless`)** (Open-Meteo forecast API, one request per spot with `models=`);
   - coastal spots only: total wave height from **MeteoFrance MFWAM (`meteofrance_wave`), ECMWF WAM (`ecmwf_wam`), GFS-Wave 0.25° (`ncep_gfswave025`)** (Open-Meteo marine API, one request per spot).
   Everything else (tide, light, rain, pressure, swell period) is held fixed. **Spread** = max − min of the best_match window score and the per-model window scores. Each full 1.5 points of spread (the width of the v1 `marginal` and `good` bands) lowers confidence one level, at most two. Agreement label: `good` < 0.75, `fair` < 1.5, `poor` ≥ 1.5. A model counts only if it has data for every hour of the window; with fewer than two wind models and fewer than two wave models, agreement is `unknown` and does not change the level. ICON only runs about 7 days, so day 7+ windows usually have two wind models.
3. **Data gaps.** If any window hour lacks wind or gust, or (coastal) both wave and swell height, confidence drops one level.
4. Confidence never rises above the lead level.

Why score spread rather than raw wind spread: it measures disagreement in the thing the user sees (the 0–10 score and rating), and automatically weights a 5 kn disagreement at 20 kn (matters) above one at 5 kn (doesn't).

## Output

- `windows[].confidence` and `verdict.confidence`: the final level (v1 enum, unchanged).
- `windows[].confidence_detail` (additive): `level`, `lead_days`, `lead_level`, `agreement`, `score_best_match`, `model_scores` (`wind:<model>`, `waves:<model>`), `score_spread`, `models_missing`, `gap_hours`, `downgrades[]` (plain-English reasons).
- `days[].confidence`: the confidence of the day's best window (or least-bad window); `days[].lead_confidence` (additive) keeps the 2.1 lead-only value.

## Real examples (fixture `tests/fixtures/real_2026-10-26d`, recorded 26 Oct 2026 00:54 NZDT)

- Hauraki Gulf, Mon 26 Oct 5–8am: lead high; scores ECMWF 8.2, GFS 8.4, ICON 9.2, all three wave models 8.2; spread 1.0 → `fair`, stays **high**.
- Hauraki Gulf, Sun 1 Nov 6–9pm (best later window, 8.4): lead medium; ECMWF 8.1, GFS 3.7, ICON 5.2 → spread 4.7, `poor` → **low**.
- Dunedin, Mon 26 Oct: window scores 3.8–6.2 across models (spread 2.4, ICON wind vs GFS-Wave) → high → **medium**. All Dunedin windows on days 0–2 are medium, so the headline verdict is medium (2.1 said high).
- Central Otago lakes (wind only): Tue 27 Oct has one window at spread 0.0 (`good`, high) and another at 2.3 (`poor`, high → medium).

## Limits

- Three wind and three wave models are not an ensemble; they share inputs and can agree and all be wrong.
- Swell period and direction, rain and pressure spread are not compared.
- Thresholds (1.5 points per step) are judgement, tied to the rating band width, not calibrated against outcomes.
