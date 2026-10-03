import { execSync } from "node:child_process";
import type { NextConfig } from "next";

function gitShort(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_COMMIT: gitShort(),
    NEXT_PUBLIC_DEPLOYED_AT: new Date().toISOString(),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" },
    ],
  },
};

export default nextConfig;
