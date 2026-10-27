"use client";
import { useMemo, useState } from "react";
import {
  CATCH_SPECIES, LINKS, closedNow, effectiveDaily, rowFor, showable, speciesIdsFor, spotRules, zoneById,
  type CatchRow, type CatchZone,
} from "@/lib/catch";

const DASH = "–";
const ROW = "self-center text-sm text-slate-500";
const BIG = "text-2xl font-bold leading-tight text-slate-900";
const SMALL = "text-sm font-normal text-slate-500";

function Fixed() {
  return (
    <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">
      Guide only. <a className="underline" href={LINKS.mpiClosures} target="_blank" rel="noopener noreferrer">Rāhui</a> may apply. MPI data <a className="underline" href={LINKS.ccBy} target="_blank" rel="license noopener noreferrer">CC BY 4.0</a>.
    </p>
  );
}

function Answer({ row, zone, label }: { row?: CatchRow; zone?: CatchZone; label: string | null }) {
  const ok = showable(row);
  const shut = ok ? closedNow(row) : null;
  const noTake = ok && row.dailyLimit === "no-take";
  const src = row?.sourceUrl ?? zone?.sourceUrl ?? LINKS.mpiRules;
  const check = !ok || row.disputed || row.pageOnly || !!row.landedState?.includes("Check MPI");
  const daily = !ok ? DASH : row.dailyLimit === "combined" ? "Part of the total" : String(effectiveDaily(row).n);
  return (
    <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
      {label && <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>}
      {shut && <p className="text-sm font-semibold text-rose-800">Closed here until {shut.until}. Put it back.</p>}
      {noTake ? (
        <p className="text-sm font-semibold text-rose-800">No take here. Put it back.</p>
      ) : (
        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2">
          <dt className={ROW}>Minimum</dt>
          <dd className={BIG}>{!ok ? DASH : row.minSizeCm === "none" ? "None" : <>{row.minSizeCm} <span className={SMALL}>cm</span><span className="block text-xs font-normal text-slate-500">Under that, put it back.</span></>}</dd>
          <dt className={ROW}>Daily limit</dt><dd className={daily.length > 3 ? "text-base font-semibold" : BIG}>{daily}</dd>
          {ok && row.shared && <><dt className={ROW}>{/vessel|boat/i.test(row.shared) ? "Per boat" : "Shared"}</dt><dd className={/^Vessel limit \d+/.test(row.shared) ? BIG : "text-sm"}>{row.shared.replace(/^Vessel limit (\d+) .*$/, "$1")}</dd></>}
          <dt className={ROW}>Area total</dt><dd className={BIG}>{ok || zone ? <>{ok ? row.combinedDaily : zone!.combinedDaily} <span className={SMALL}>finfish{ok && row.combinedVessel ? `, ${row.combinedVessel} per boat` : ""}</span></> : DASH}</dd>
          {ok && row.landedState?.startsWith("Whole or gutted only") && <><dt className={ROW}>Landed</dt><dd className="self-center text-sm font-semibold">Whole or gutted only.</dd></>}
        </dl>
      )}
      <p className="text-xs text-slate-400">
        <a className="underline" href={src} target="_blank" rel="noopener noreferrer">Source: MPI</a>
        {check && <span className="ml-2 font-semibold text-amber-700">check MPI</span>}
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
        <p className="text-sm text-slate-700">Not mapped yet. <a className="underline" href={LINKS.mpiRules} target="_blank" rel="noopener noreferrer">Source: MPI</a></p>
      ) : sr.freshwater ? (
        <p className="text-sm text-slate-700">Freshwater: <a className="underline" href={LINKS.fishAndGame} target="_blank" rel="noopener noreferrer">Fish &amp; Game rules</a> apply.</p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Fish">
              {chips.map((id) => <button type="button" key={id} aria-pressed={species === id} className={pill(species === id)} onClick={() => setSpecies(id)}>{CATCH_SPECIES.find((x) => x.id === id)!.name}</button>)}
              {here.length > 0 && <button type="button" className="rounded-full px-3 py-2 text-sm text-ocean-700 underline" onClick={() => { setMore(!more); if (more && !here.includes(species)) setSpecies(here[0]); }}>{more ? "Fewer fish" : "More fish"}</button>}
            </div>
          </div>

          {options.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Depends where you are</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={pill(where === "all")} onClick={() => setWhere("all")}>Show all</button>
                {options.map((o) => <button type="button" key={o.zone} className={pill(where === o.zone)} onClick={() => setWhere(o.zone)}>{o.label}</button>)}
              </div>
            </div>
          )}
          <div className="space-y-2">
            {shown.map((o) => <Answer key={o.zone} row={rowFor(o.zone, species)} zone={zoneById(o.zone)} label={options.length > 1 ? o.label : null} />)}
          </div>
        </>
      )}
      <Fixed />
    </section>
  );
}
