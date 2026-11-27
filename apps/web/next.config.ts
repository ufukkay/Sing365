import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@sing365/render", "@sing365/rules", "@sing365/db", "@sing365/graph"],
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
};

export default config;
