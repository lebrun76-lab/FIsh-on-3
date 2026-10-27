import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  images: { localPatterns: [{ pathname: "/photos/**", search: "" }], qualities: [75] },
};
export default nextConfig;
