import type { NextConfig } from "next";

const apiPort = process.env.BACKEND_PORT ?? "3000";
const apiOrigin = process.env.BACKEND_ORIGIN ?? `http://127.0.0.1:${apiPort}`;

const nextConfig: NextConfig = {
  // Next 16 blocks cross-origin dev assets: when the site is opened via 127.0.0.1 while the
  // dev server treats localhost as its origin, client chunks/HMR are refused and hydration
  // silently never happens (pages stay on loading skeletons). Allow loopback hostnames.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Same-origin proxy for the backend API. The browser always calls /api/v1 on this origin
  // (NEXT_PUBLIC_API_URL defaults to that), and Next forwards it to the backend server.
  // This keeps the binding working in dev, production, and Docker without CORS setup.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
