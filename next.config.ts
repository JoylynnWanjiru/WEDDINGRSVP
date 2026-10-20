import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Private pages stay out of search engines; no referrer leaks (§12).
  async headers() {
    const noindex = { key: "X-Robots-Tag", value: "noindex, nofollow" };
    return [
      { source: "/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/i/:path*", headers: [noindex] },
      { source: "/admin/:path*", headers: [noindex] },
      { source: "/scan/:path*", headers: [noindex] },
    ];
  },
  // D22: one page per guest. Old /pass and /day links jump to that section at the HTTP
  // level (works without JavaScript). Temporary (307), so nothing caches it forever.
  async redirects() {
    return [
      { source: "/i/:token/pass", destination: "/i/:token#pass", permanent: false },
      { source: "/i/:token/day", destination: "/i/:token#programme", permanent: false },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
