import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: [
    "@electric-sql/pglite",
    "@electric-sql/pglite-pgvector",
    "postgres",
  ],
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: { "/api/*": ["./db/*.sql"] },
  outputFileTracingExcludes: {
    "*": ["./.wasl-data*/**/*", "./.wasl-demo/**/*"],
  },
  webpack(config, { dev }) {
    if (dev)
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        ignored: ["**/node_modules/**", "**/.git/**", "**/.wasl-data/**"],
      };
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'${process.env.NODE_ENV === "development" ? " ws: wss:" : ""}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
