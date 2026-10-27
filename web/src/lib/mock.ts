/**
 * MOCK Forecast Brain. Produces deterministic, plausible-looking data in the
 * exact v1 contract shape (src/lib/types.ts). Replace with HTTP calls to the
 * real Python service; nothing in the UI should need to change.
 * Scoring mirrors score_spot() in messenger.py (PR #1), applied per hour.
 */
import spotsJson from "./spots.json";
import type { DaySummary, FishingWindow, HourPoint, Rating, Spot, SpotForecast, TideEvent, Verdict } from "./types";
import { dayLong, clock, nzTodayISO } from "./time";

export const SPOTS = spotsJson as Spot[];
export const getSpot = (id: string) => SPOTS.find((s) => s.id === id);

const OFFSET = "+13:00"; // NZDT; mock only
const pad = (n: number) => String(n).padStart(2, "0");

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

// Same bands as the engine (see ratingFor in call.ts).
export function rate(score: number): Rating {
  if (score >= 7.5) return "great";
  if (score >= 6) return "good";
  if (score >= 4.5) return "marginal";
  return "poor";
}

function hourScore(wind: number, gust: number, swell: number | null, rainHr: number, coastal: boolean) {
  let s = 5;
  if (wind < 8) s += 2.5; else if (wind < 12) s += 1.5; else if (wind < 18) s += 0.5; else if (wind > 25) s -= 3; else s -= 1.5;
  if (gust > 30) s -= 1.5;
  if (coastal && swell !== null) { if (swell < 1) s += 2; else if (swell < 1.5) s += 1; else if (swell >= 2.5) s -= 2; }
  const rainDay = rainHr * 24;
  if (rainDay < 1) s += 1; else if (rainDay > 5) s -= 1.5;
  return Math.max(0, Math.min(10, Math.round(s * 10) / 10));
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

export function buildForecast(spot: Spot, days = 10): SpotForecast {
  const r = rng(spot.id + nzTodayISO());
  const [y, m, d] = nzTodayISO().split("-").map(Number);
  const hours = days * 24;
  const windBase = 7 + r() * 8 + (spot.region.includes("Wellington") || spot.id === "bluff" ? 6 : 0);
  const swellBase = spot.coastal ? 0.5 + r() * 1.3 + (spot.id === "greymouth" || spot.id === "fiordland" ? 0.8 : 0) : 0;
  const sstBase = 17.5 - (Math.abs(spot.lat) - 35) * 0.62; // ~17°C Northland → ~11°C Bluff (late Oct)
  const tidePhase = r() * 12.42;
  const tideAmp = 0.8 + r() * 0.9;
  const p1 = r() * 6.28, p2 = r() * 6.28;
  const wetDay = Math.floor(r() * days);

  const hourly: HourPoint[] = [];
  for (let i = 0; i < hours; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d, i));
    const time = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:00:00${OFFSET}`;
    const h = dt.getUTCHours();
    const synoptic = Math.sin(i / 26 + p1) * 0.5 + Math.sin(i / 61 + p2) * 0.5; // weather systems
    const seaBreeze = h >= 11 && h <= 18 ? Math.sin(((h - 11) / 7) * Math.PI) * 5 : 0;
    const wind = Math.max(1, round(windBase + synoptic * 7 + seaBreeze + (r() - 0.5) * 2));
    const gust = round(wind * (1.35 + r() * 0.25));
    const swell = spot.coastal ? Math.max(0.2, round(swellBase + Math.sin(i / 40 + p2) * 0.6 + synoptic * 0.3, 2)) : null;
    const period = spot.coastal ? round(8 + Math.sin(i / 50 + p1) * 3) : null;
    const sst = spot.coastal ? round(sstBase + Math.sin(((h - 15) / 24) * 6.28) * 0.3 + i * 0.003) : null;
    const tide = spot.coastal ? round(tideAmp * Math.cos((2 * Math.PI * (i - tidePhase)) / 12.42), 2) : null;
    const day = Math.floor(i / 24);
    const rain = day === wetDay || (day === wetDay + 1 && h < 10) ? round(r() * 2.5) : r() > 0.93 ? round(r() * 0.6) : 0;
    hourly.push({ time, wind_kn: wind, gust_kn: gust, wind_dir_deg: Math.round((200 + synoptic * 90 + 360) % 360), swell_m: swell === null ? null : Math.round(swell * 0.75 * 100) / 100, wave_m: swell, swell_period_s: period, sst_c: sst, tide_m: tide, rain_mm: rain, score: hourScore(wind, gust, swell, rain, spot.coastal) });
  }

  // Tides: analytic highs/lows of the semi-diurnal curve
  const tides: TideEvent[] = [];
  if (spot.coastal) {
    for (let k = -1; k < hours / 6.21 + 1; k++) {
      const t = tidePhase + k * 6.21;
      if (t < 0 || t >= hours) continue;
      const dt = new Date(Date.UTC(y, m - 1, d, 0, Math.round(t * 60)));
      tides.push({ time: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:00${OFFSET}`, type: k % 2 === 0 ? "high" : "low", height_m: round(k % 2 === 0 ? tideAmp : -tideAmp, 2) });
    }
  }

  // Daily summaries (daylight 6am–8pm for the score)
  const daysOut: DaySummary[] = [];
  for (let dd = 0; dd < days; dd++) {
    const all = hourly.slice(dd * 24, dd * 24 + 24);
    const light = all.slice(6, 21);
    const best = Math.max(...light.map((x) => x.score ?? 0));
    const morning = avg(light.slice(0, 5).map((x) => x.wind_kn)) ?? 0;
    const arvo = avg(light.slice(7, 12).map((x) => x.wind_kn)) ?? 0;
    const rainTot = round(all.reduce((a, b) => a + (b.rain_mm ?? 0), 0));
    let summary = morning < 10 ? "Calm early" : morning < 16 ? "Light breeze early" : "Windy from the start";
    summary += arvo > morning + 4 ? ", breeze picks up after lunch" : arvo < morning - 3 ? ", easing in the afternoon" : ", similar all day";
    if (rainTot > 5) summary += ". Showers around";
    daysOut.push({ date: all[0].time.slice(0, 10), score: best, rating: rate(best), summary, wind_kn_avg: avg(light.map((x) => x.wind_kn)), gust_kn_max: Math.max(...all.map((x) => x.gust_kn ?? 0)), swell_m_avg: spot.coastal ? avg(light.map((x) => x.swell_m)) : null, rain_mm: rainTot, sst_c_avg: avg(all.map((x) => x.sst_c)), sunrise: `${all[0].time.slice(0, 10)}T06:${pad(10 + dd)}:00${OFFSET}`, sunset: `${all[0].time.slice(0, 10)}T20:${pad(5 + dd)}:00${OFFSET}` });
  }

  // Fishing windows: >= 2 consecutive daylight hours scoring >= 6.5
  const windows: FishingWindow[] = [];
  let run: HourPoint[] = [];
  const flush = () => {
    if (run.length > 4) {
      // keep the best 4-hour block of a long settled spell
      let bi = 0, bs = -1;
      for (let i = 0; i + 4 <= run.length; i++) {
        const sc = run.slice(i, i + 4).reduce((a, b) => a + (b.score ?? 0), 0) - run.slice(i, i + 4).reduce((a, b) => a + (b.wind_kn ?? 0), 0) * 0.05;
        if (sc > bs) { bs = sc; bi = i; }
      }
      run = run.slice(bi, bi + 4);
    }
    if (run.length >= 2) {
      const sc = round(run.reduce((a, b) => a + (b.score ?? 0), 0) / run.length);
      const w = run.map((x) => x.wind_kn ?? 0);
      const sw = run.map((x) => x.swell_m).filter((x): x is number => x !== null);
      const end = run[run.length - 1].time.replace(/T(\d\d)/, (_, hh) => `T${pad(Number(hh) + 1)}`);
      const lo = Math.round(Math.min(...w)), hi = Math.round(Math.max(...w));
      const reasons = [lo === hi ? `Wind ~${lo} kn` : `Wind ${lo}–${hi} kn`];
      if (sw.length) reasons.push(`Small swell ~${avg(sw)} m`);
      const tideIn = tides.find((t) => t.time >= run[0].time && t.time <= end);
      if (tideIn) reasons.push(`${tideIn.type === "high" ? "High" : "Low"} tide ${clock(tideIn.time)}`);
      if (run.every((x) => (x.rain_mm ?? 0) < 0.2)) reasons.push("Dry");
      const rt = rate(sc);
      windows.push({
        start: run[0].time, end, score: sc, rating: rt,
        headline: `${dayLong(run[0].time)} ${clock(run[0].time)}–${clock(end)} looks ${rt}`,
        advice: tideIn
          ? `Get there for ${clock(run[0].time)}. Fish the ${tideIn.type === "high" ? "top of the tide" : "turn of the low"} around ${clock(tideIn.time)}. That's usually when they come on the bite.`
          : `Settled conditions for ${run.length} hours. A good chance to get out without fighting the weather.`,
        reasons,
      });
    }
    run = [];
  };
  hourly.forEach((hp) => {
    const h = Number(hp.time.slice(11, 13));
    if (h >= 5 && h <= 20 && (hp.score ?? 0) >= 7) run.push(hp);
    else flush();
  });
  flush();
  windows.sort((a, b) => b.score - a.score);

  const bestDay = [...daysOut].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const top = windows[0];
  const verdict: Verdict = top
    ? { rating: top.rating, score: top.score, headline: top.rating === "great" ? `Go ${dayLong(top.start)} ${Number(top.start.slice(11, 13)) < 12 ? "morning" : "afternoon"}` : `Best chance: ${dayLong(top.start)}`, advice: `${top.headline}: ${top.reasons.slice(0, 2).join(", ").toLowerCase()}. ${top.advice}`, confidence: top.start.slice(0, 10) <= daysOut[2].date ? "high" : "medium" }
    : { rating: bestDay.rating, score: bestDay.score ?? 0, headline: "Not a great week", advice: `Conditions look ${bestDay.rating} at best. ${dayLong(bestDay.date)} is the least-bad day: ${bestDay.summary.toLowerCase()}. Maybe one to sit out or try somewhere more sheltered.`, confidence: "medium" };

  return {
    api_version: "1", spot, generated_at: `${nzTodayISO()}T05:00:00${OFFSET}`, model_run: "MOCK", sources: ["MOCK DATA: prototype only", "Production: Open-Meteo forecast + marine (CC BY 4.0)"],
    verdict, days: daysOut, windows: windows.slice(0, 6), tides, hourly,
  };
}
