import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@sing365/render", "@sing365/rules"],
  poweredByHeader: false,
};

export default config;
