import type { MetadataRoute } from "next";
import { demoMode } from "@/lib/demo";
import { BRAND } from "@/lib/brand";
// /robots.txt. In demo mode: keep every crawler out (with the noindex meta tag and X-Robots-Tag header).
export default function robots(): MetadataRoute.Robots {
  if (demoMode()) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" }, host: BRAND.url };
}
