"use client";
import { useMemo, useState } from "react";
import {
  CATCH_SPECIES, LINKS, MPI_ATTRIBUTION, closedNow, dailyText, minText, rowFor, showable, speciesIdsFor, spotRules, verdict, zoneById,
  type CatchRow, type CatchZone, type Tone,
} from "@/lib/catch";

const TONE: Record<Tone, string> = {
  back: "bg-rose-50 text-rose-900 ring-rose-200",
  limit: "bg-ocean-100 text-ocean-900 ring-ocean-500/30",
  check: "bg-amber-50 text-amber-900 ring-amber-200",
  info: "bg-slate-50 text-slate-800 ring-slate-200",
};
const nzDate = (iso: string) => new Date(`${iso}T12:00:00+13:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" });

function Fixed() {
  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
      <p className="font-semibold text-slate-800">Guide only. The law is the MPI rules. Check the <a className="underline" href={LINKS.mpiApp} target="_blank" rel="noopener noreferrer">NZ Fishing Rules app</a> or <a className="underline" href={LINKS.mpiRules} target="_blank" rel="noopener noreferrer">mpi.govt.nz</a> before you keep fish.</p>
      <p>Local rāhui may apply. See <a className="underline" href={LINKS.mpiClosures} target="_blank" rel="noopener noreferrer">MPI closures</a> and <a className="underline" href={LINKS.docReserves} target="_blank" rel="noopener noreferrer">DOC marine reserves</a>.</p>
      <p className="text-slate-400">{MPI_ATTRIBUTION.replace("Creative Commons Attribution 4.0 International licence.", "")}<a className="underline" href={LINKS.ccBy} target="_blank" rel="license noopener noreferrer">Creative Commons Attribution 4.0 International licence</a>.</p>
    </div>
  );
}

function Answer({ row, zone, label, len }: { row?: CatchRow; zone?: CatchZone; label: string | null; len: number | null }) {
  const ok = showable(row);
  const v = verdict(row, zone, len);
  const shut = row && ok ? closedNow(row) : null;
  const src = row?.sourceUrl ?? zone?.sourceUrl ?? LINKS.mpiRules;
  return (
    <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
      {label && <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>}
      <p role="status" className={`rounded-lg px-3 py-2 text-base font-semibold ring-1 ${TONE[v.tone]}`}>{v.text}</p>
      {ok ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">Size</dt><dd>{minText(row)}</dd>
          <dt className="text-slate-500">Limit</dt><dd>{dailyText(row, zone)}</dd>
          {zone && row.dailyLimit !== "combined" && <><dt className="text-slate-500">Total</dt><dd>{zone.combinedDaily} finfish a day, all species</dd></>}
          {row.shared && <><dt className="text-slate-500">Shared</dt><dd>{row.shared}</dd></>}
          {row.closure && <><dt className="text-slate-500">Closure</dt><dd className={shut ? "font-semibold text-rose-800" : ""}>{row.closure.text}{shut ? " Closed now." : ""}</dd></>}
          {row.accumulation && <><dt className="text-slate-500">Over days</dt><dd>{row.accumulation}</dd></>}
          {row.landedState && <><dt className="text-slate-500">Landed</dt><dd>{row.landedState}</dd></>}
        </dl>
      ) : (
        <p className="text-sm text-slate-700">No numbers shown for this one. <a className="font-semibold text-ocean-700 underline" href={src} target="_blank" rel="noopener noreferrer">Check the MPI page</a>.</p>
      )}
      {row?.notes.map((n) => <p key={n} className="text-xs text-slate-500">{n}</p>)}
      {zone?.notes.map((n) => <p key={n} className="text-xs text-slate-500">{n}</p>)}
      <p className="text-xs text-slate-400">
        Source: <a className="underline" href={src} target="_blank" rel="noopener noreferrer">MPI {zone?.fma ?? ""} rules</a>{zone ? ` (last reviewed ${nzDate(zone.lastReviewedOnSource)})` : ""}
        {row?.noticePart && row.noticeUrl ? <>, <a className="underline" href={row.noticeUrl} target="_blank" rel="noopener noreferrer">2026 notice</a> cl. {row.noticePart}</> : null}
        {row ? `. We checked it ${nzDate(row.dateChecked)}. Not yet verified.` : "."}
      </p>
    </div>
  );
}

/** "Can I keep it?" panel. On a spot page pass spotId and the spot's species; on /rules pass spots to pick from. */
export function CatchCheck({ spotId, spotSpecies = [], spots }: { spotId?: string; spotSpecies?: string[]; spots?: { id: string; name: string }[] }) {
  const [pickedSpot, setPickedSpot] = useState(spotId ?? spots?.find((s) => !spotRules(s.id)?.freshwater)?.id ?? "");
  const sid = spotId ?? pickedSpot;
  const sr = spotRules(sid);
  const here = useMemo(() => speciesIdsFor(spotSpecies), [spotSpecies]);
  const [species, setSpecies] = useState(here[0] ?? "snapper");
  const [lenText, setLenText] = useState("");
  const [where, setWhere] = useState<string | "all">("all");
  const len = lenText.trim() === "" ? null : Number(lenText.replace(",", "."));
  const options = sr?.options ?? [];
  const shown = where === "all" ? options : options.filter((o) => o.zone === where);
  const others = CATCH_SPECIES.filter((s) => !here.includes(s.id));
  const pill = (on: boolean) => `rounded-full px-3 py-1.5 text-sm ring-1 ${on ? "bg-ocean-900 text-white ring-ocean-900" : "bg-white text-slate-700 ring-slate-200"}`;

  return (
    <section aria-labelledby="catch-check" className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <div>
        <h2 id="catch-check" className="text-lg font-bold">Can I keep it?</h2>
        <p className="text-sm text-slate-600">Pick the fish, add a length if you've measured it. Free, no sign-in.</p>
      </div>

      {spots && (
        <label className="block text-sm">
          <span className="font-semibold">Where</span>
          <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" value={pickedSpot} onChange={(e) => { setPickedSpot(e.target.value); setWhere("all"); }}>
            {spots.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}

      {!sr ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">We haven't mapped this spot to an MPI area yet. <a className="font-semibold underline" href={LINKS.mpiRules} target="_blank" rel="noopener noreferrer">Find your area on mpi.govt.nz</a>.</p>
      ) : sr.freshwater ? (
        <p className="rounded-xl bg-ocean-100 p-3 text-sm text-ocean-900">Freshwater: Fish &amp; Game rules apply. You need a licence, and seasons and limits are set by region. <a className="font-semibold underline" href={LINKS.fishAndGame} target="_blank" rel="noopener noreferrer">Fish &amp; Game rules</a>.</p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_7.5rem] gap-2">
            <label className="block text-sm">
              <span className="font-semibold">Fish</span>
              <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" value={species} onChange={(e) => setSpecies(e.target.value)}>
                {here.length > 0 && <optgroup label="Caught here">{here.map((id) => { const s = CATCH_SPECIES.find((x) => x.id === id)!; return <option key={id} value={id}>{s.name}</option>; })}</optgroup>}
                <optgroup label={here.length ? "Other fish" : "Fish"}>{others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Length (cm)</span>
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" inputMode="decimal" placeholder="optional" value={lenText} onChange={(e) => setLenText(e.target.value.replace(/[^0-9.,]/g, ""))} aria-describedby="len-hint" />
            </label>
          </div>
          <p id="len-hint" className="-mt-1 text-xs text-slate-500">Measure it the MPI way. The NZ Fishing Rules app shows how{species === "blue_cod" ? ". Blue cod go from the nose to the end of the middle ray of the tail" : ""}.</p>

          {options.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm"><b>Depends where you are.</b> {sr.note}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={pill(where === "all")} onClick={() => setWhere("all")}>Show all</button>
                {options.map((o) => <button type="button" key={o.zone} className={pill(where === o.zone)} onClick={() => setWhere(o.zone)}>{o.label}</button>)}
              </div>
            </div>
          )}
          <div className="space-y-2">
            {shown.map((o) => <Answer key={o.zone} row={rowFor(o.zone, species)} zone={zoneById(o.zone)} label={options.length > 1 ? o.label : zoneById(o.zone)?.name ?? null} len={len} />)}
          </div>
        </>
      )}
      <Fixed />
    </section>
  );
}
