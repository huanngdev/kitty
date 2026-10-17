import type { NextConfig } from "next";
import { getServerEnv } from "./src/lib/env";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@kitty/ui", "@kitty/shared"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser only ever talks to this origin; /api is proxied to apps/api so
  // auth cookies are first-party (docs/25-code-architecture.md §1).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${getServerEnv().API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
