import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // The stylesheet is split by authored cascade layers, so separate chunks
  // repeat the same gzip dictionary and add a request without deferring work.
  // Preserve that cascade while shipping one smaller compressed response.
  experimental: {
    cssChunking: false,
  },
  // The dev overlay's floating badge sits on top of live data in the bottom-left
  // corner of every screenshot, review capture and recorded walkthrough taken
  // against the dev server. It is a build artefact overlaying the product.
  devIndicators: false,
};

export default nextConfig;
