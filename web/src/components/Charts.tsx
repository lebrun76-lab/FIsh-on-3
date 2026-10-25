"use client";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HourPoint } from "@/lib/types";
import { clock, dayShort } from "@/lib/time";

const tick = (iso: string) => (iso.slice(11, 13) === "00" ? dayShort(iso) : iso.slice(11, 13) === "12" ? "noon" : "");
const ticks = (data: HourPoint[]) => data.filter((d) => ["00", "12"].includes(d.time.slice(11, 13))).map((d) => d.time);

function Frame({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mb-2 text-sm text-slate-500">{hint}</p>
      <div className="h-40 md:h-48">{children}</div>
    </section>
  );
}
const common = (data: HourPoint[]) => ({
  x: <XAxis dataKey="time" ticks={ticks(data)} tickFormatter={tick} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />,
  grid: <CartesianGrid vertical={false} stroke="#f1f5f9" />,
  tip: (unit: string) => <Tooltip labelFormatter={(l) => `${dayShort(String(l))} ${clock(String(l))}`} formatter={(v) => [`${v} ${unit}`]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />,
});

export function WindChart({ data }: { data: HourPoint[] }) {
  const c = common(data);
  return (
    <Frame title="Wind" hint="Green band = comfortable (under 10 knots). Dashed line = gusts.">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: -20, right: 4, top: 4 }}>
          {c.grid}<ReferenceArea y1={0} y2={10} fill="#10b981" fillOpacity={0.08} />
          {c.x}<YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} unit="kn" width={52} />
          {c.tip("kn")}
          <Area type="monotone" dataKey="wind_kn" name="Wind" stroke="#13608f" fill="#1f8ac0" fillOpacity={0.25} strokeWidth={2} />
          <Area type="monotone" dataKey="gust_kn" name="Gust" stroke="#94a3b8" strokeDasharray="4 3" fill="none" />
        </AreaChart>
      </ResponsiveContainer>
    </Frame>
  );
}
export function SwellChart({ data }: { data: HourPoint[] }) {
  const c = common(data);
  return (
    <Frame title="Swell" hint="Under 1 m is easy for small boats and rock fishing.">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: -20, right: 4, top: 4 }}>
          {c.grid}<ReferenceArea y1={0} y2={1} fill="#10b981" fillOpacity={0.08} />
          {c.x}<YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} unit="m" width={48} />
          {c.tip("m")}
          <Area type="monotone" dataKey="swell_m" name="Swell" stroke="#0e7490" fill="#22d3ee" fillOpacity={0.25} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </Frame>
  );
}
export function TideChart({ data }: { data: HourPoint[] }) {
  const c = common(data);
  return (
    <Frame title="Tide" hint="Peaks are high tide. Fish often bite best around the turn.">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: -20, right: 4, top: 4 }}>
          {c.grid}{c.x}<YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} unit="m" width={48} />
          {c.tip("m")}
          <Area type="monotone" dataKey="tide_m" name="Tide" stroke="#4338ca" fill="#818cf8" fillOpacity={0.18} strokeWidth={2} baseValue="dataMin" />
        </AreaChart>
      </ResponsiveContainer>
    </Frame>
  );
}
export function SstChart({ data }: { data: HourPoint[] }) {
  const c = common(data);
  const v = data.map((d) => d.sst_c ?? 0);
  return (
    <Frame title="Sea temperature" hint="Warmer water (16°C+) usually means more active snapper and kingfish.">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: -20, right: 4, top: 4 }}>
          {c.grid}{c.x}<YAxis domain={[Math.floor(Math.min(...v) - 1), Math.ceil(Math.max(...v) + 1)]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} unit="°" width={44} />
          {c.tip("°C")}
          <Line type="monotone" dataKey="sst_c" name="Sea temp" stroke="#ea580c" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  );
}
