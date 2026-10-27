// Tiny wall-clock helpers. Times are NZ local wall time strings with offset,
// so we format them by parsing the string rather than via the browser's zone.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parts(iso: string) {
  const [d, t = "00:00"] = iso.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.slice(0, 5).split(":").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return { y, m, day, hh, mm, wd };
}
export const dayShort = (iso: string) => DAYS[parts(iso).wd];
export const dayLong = (iso: string) => LONG_DAYS[parts(iso).wd];
export const dateLabel = (iso: string) => {
  const p = parts(iso);
  return `${DAYS[p.wd]} ${p.day} ${MONTHS[p.m - 1]}`;
};
export function clock(iso: string) {
  const { hh, mm } = parts(iso);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${mm ? ":" + String(mm).padStart(2, "0") : ""}${hh < 12 ? "am" : "pm"}`;
}
export function nzTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date());
}
