import { Suspense } from "react";
import { SignInForm } from "@/components/SignInForm";
export const metadata = { title: "Sign in" };
export default function SignIn() { return <Suspense><SignInForm /></Suspense>; }
