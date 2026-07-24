import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LM Board",
    short_name: "LM Board",
    description: "Benchmark scores for frontier language models.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ee",
    theme_color: "#131110",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
