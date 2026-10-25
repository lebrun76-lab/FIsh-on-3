import Link from "next/link";
export const metadata = { title: "Offline" };
export default function Offline() {
  return <div className="pt-10 text-center space-y-2"><h1 className="text-2xl font-bold">You’re offline</h1><p className="text-slate-600">No signal? Forecasts you saved for offline still open.</p><Link href="/saved" className="font-semibold text-ocean-700">Go to saved spots →</Link></div>;
}
