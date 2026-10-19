import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native deps that should never be bundled. The instrumentation hook in
  // src/instrumentation.ts is loaded by both the Node and Edge runtimes;
  // without this, Edge bundling traces through to better-sqlite3's
  // bindings.js → "fs" and fails the build.
  serverExternalPackages: ["better-sqlite3", "sharp"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2gb"
    }
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Share tokens live in the URL path (/shares/<token>), so never send it on as a referrer.
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" }
        ]
      }
    ];
  }
};

export default nextConfig;
