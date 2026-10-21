import type { NextConfig } from "next";

// Every page in this app is private and per-user, so pages render dynamically per request.
// Cache Components / partial prefetching are intentionally not enabled: they would add
// caching layers around personal data for no benefit.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The end-to-end tests load the dev server through 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
