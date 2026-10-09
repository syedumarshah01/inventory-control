import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it out of the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  // Allow the sandbox/dev preview proxy (https://<port>-<sandbox>.e2b.app) to reach the dev server.
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
