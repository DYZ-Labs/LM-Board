import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LM Board",
    short_name: "LM Board",
    description: "Benchmark scores for frontier AI models.",
    start_url: "/",
    display: "standalone",
    // Installed shells and launch splashes intentionally keep the dark brand
    // ground: a web manifest has one static install-time colour and cannot
    // follow the site's saved preference. Once the document opens, its
    // before-paint theme-color tag tracks the explicit light/dark selection.
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
