"use client";
import { useMemo, useState } from "react";
import {
  CATCH_SPECIES, LINKS, MPI_ATTRIBUTION, closedNow, dailyText, minText, totalText, rowFor, showable, speciesIdsFor, spotRules, statusLine, zoneById,
  type CatchRow, type CatchZone, type Tone,
} from "@/lib/catch";

const TONE: Record<Tone, string> = {
  back: "bg-rose-50 text-rose-900 ring-rose-200",
  check: "bg-amber-50 text-amber-900 ring-amber-200",
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

const isBoat = (t: string) => /vessel|boat/i.test(t);

function Answer({ row, zone, label }: { row?: CatchRow; zone?: CatchZone; label: string | null }) {
  const ok = showable(row);
  const v = statusLine(row);
  const shut = row && ok ? closedNow(row) : null;
  const src = row?.sourceUrl ?? zone?.sourceUrl ?? LINKS.mpiRules;
  return (
    <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
      {label && <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>}
      {v && <p role="status" className={`rounded-lg px-3 py-2 text-base font-semibold ring-1 ${TONE[v.tone]}`}>{v.text}</p>}
      {ok ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">Size</dt>
          <dd>{row.dailyLimit === "no-take" ? "No take here. Put it back." : <>{minText(row)}{typeof row.minSizeCm === "number" && <span className="block font-semibold">Under that, put it back.</span>}</>}</dd>
          {row.dailyLimit !== "no-take" && <><dt className="text-slate-500">Per person</dt><dd>{dailyText(row, zone)}</dd></>}
          {row.shared && <><dt className="text-slate-500">{isBoat(row.shared) ? "Per boat" : "Shared"}</dt><dd>{row.shared}</dd></>}
          <dt className="text-slate-500">All finfish</dt><dd>{totalText(row)}</dd>
          {row.closure && <><dt className="text-slate-500">Closure</dt><dd className={shut ? "font-semibold text-rose-800" : ""}>{row.closure.text}{shut ? " Closed now." : ""}</dd></>}
          {row.accumulation && <><dt className="text-slate-500">Over days</dt><dd>{row.accumulation}</dd></>}
          {row.landedState && <><dt className="text-slate-500">Landed</dt><dd>{row.landedState}</dd></>}
        </dl>
      ) : (
        <p className="text-sm text-slate-700">No numbers shown for this one. <a className="font-semibold text-ocean-700 underline" href={src} target="_blank" rel="noopener noreferrer">Check the MPI page</a>.</p>
      )}
      {row?.disputed && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">MPI sources differ, check MPI. We show the lower number.</p>}
      {row?.pageOnly && <p className="text-xs text-slate-500">This number is from the MPI area page only, not the 2026 notice.</p>}
      {row?.notes.map((n) => <p key={n} className="text-xs text-slate-500">{row.disputed ? n.replace("MPI sources differ, check MPI. ", "") : n}</p>)}
      {zone?.notes.map((n) => <p key={n} className="text-xs text-slate-500">{n}</p>)}
      <p className="text-xs text-slate-400">
        Source: <a className="underline" href={src} target="_blank" rel="noopener noreferrer">MPI {zone?.fma ?? ""} rules</a>{zone ? ` (last reviewed ${nzDate(zone.lastReviewedOnSource)})` : ""}
        {row?.noticePart && row.noticeUrl ? <>, <a className="underline" href={row.noticeUrl} target="_blank" rel="noopener noreferrer">2026 notice</a> cl. {row.noticePart}</> : null}
        {row ? (row.verified && row.verifiedOn ? `. Checked against MPI twice, last on ${nzDate(row.verifiedOn)}.` : `. We checked it ${nzDate(row.dateChecked)}. Not confirmed by a second check.`) : "."}
      </p>
    </div>
  );
}

/** "Size and bag limits" panel. On a spot page pass spotId and the spot's species; on /rules pass spots to pick from. */
export function CatchCheck({ spotId, spotSpecies = [], spots }: { spotId?: string; spotSpecies?: string[]; spots?: { id: string; name: string }[] }) {
  const [pickedSpot, setPickedSpot] = useState(spotId ?? spots?.find((s) => !spotRules(s.id)?.freshwater)?.id ?? "");
  const sid = spotId ?? pickedSpot;
  const sr = spotRules(sid);
  const here = useMemo(() => speciesIdsFor(spotSpecies), [spotSpecies]);
  const [species, setSpecies] = useState(here[0] ?? "snapper");
  const [more, setMore] = useState(here.length === 0);
  const [where, setWhere] = useState<string | "all">("all");
  const options = sr?.options ?? [];
  const shown = where === "all" ? options : options.filter((o) => o.zone === where);
  const others = CATCH_SPECIES.filter((s) => !here.includes(s.id));
  const chips = more ? [...here, ...others.map((s) => s.id)] : here;
  const pill = (on: boolean) => `rounded-full px-3 py-2 text-sm ring-1 ${on ? "bg-ocean-900 text-white ring-ocean-900" : "bg-white text-slate-700 ring-slate-200"}`;

  return (
    <section aria-labelledby="catch-check" className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <div>
        <h2 id="catch-check" className="text-lg font-bold">Size and bag limits</h2>
        <p className="text-sm text-slate-600">Pick a fish to see the rules for this spot. Free, no sign-in.</p>
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
          <div className="space-y-2">
            <p className="text-sm font-semibold">{here.length && !more ? "Fish caught here" : "Fish"}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Fish">
              {chips.map((id) => <button type="button" key={id} aria-pressed={species === id} className={pill(species === id)} onClick={() => setSpecies(id)}>{CATCH_SPECIES.find((x) => x.id === id)!.name}</button>)}
              {here.length > 0 && <button type="button" className="rounded-full px-3 py-2 text-sm text-ocean-700 underline" onClick={() => { setMore(!more); if (more && !here.includes(species)) setSpecies(here[0]); }}>{more ? "Fewer fish" : "More fish"}</button>}
            </div>
            {species === "blue_cod" && <p className="text-xs text-slate-500">Blue cod are measured from the nose to the end of the middle ray of the tail.</p>}
          </div>

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
            {shown.map((o) => <Answer key={o.zone} row={rowFor(o.zone, species)} zone={zoneById(o.zone)} label={options.length > 1 ? o.label : zoneById(o.zone)?.name ?? null} />)}
          </div>
        </>
      )}
      <Fixed />
    </section>
  );
}
