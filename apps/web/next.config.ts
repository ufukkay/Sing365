import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@sing365/render", "@sing365/rules", "@sing365/db", "@sing365/graph"],
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
  // `next build` also writes a self-contained server (.next/standalone) for the Docker image (deploy/).
  output: "standalone",
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), "../.."),
};

export default config;
