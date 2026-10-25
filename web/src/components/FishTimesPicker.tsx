"use client";
import { FISH_TIMES, toggleTime, type FishTime } from "@/lib/fishtimes";
/** "When can you fish?" chips, used at sign-up and in account settings. */
export function FishTimesPicker({ value, onChange, hint = true }: { value: FishTime[]; onChange: (t: FishTime[]) => void; hint?: boolean }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold">When can you fish?</legend>
      <div className="flex flex-wrap gap-2">
        {FISH_TIMES.map((t) => {
          const on = value.includes(t.id);
          return <button key={t.id} type="button" aria-pressed={on} title={t.rule} onClick={() => onChange(toggleTime(value, t.id))}
            className={`rounded-full px-3 py-2 text-sm ${on ? "bg-ocean-900 text-white" : "bg-white ring-1 ring-slate-200"}`}>{t.label}</button>;
        })}
      </div>
      {hint && <p className="mt-1.5 text-xs text-slate-500">We only send an alert when a good window falls inside these times, 1 to 2 days ahead. Before work means the window ends by 9am.</p>}
    </fieldset>
  );
}
