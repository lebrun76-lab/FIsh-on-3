import { Suspense } from "react";
import { AccountView } from "@/components/AccountView";
import { SPOTS } from "@/lib/mock";
export const metadata = { title: "Account" };
export default function Account() { return <Suspense><AccountView spots={SPOTS.map((s) => ({ id: s.id, name: s.name }))} /></Suspense>; }
