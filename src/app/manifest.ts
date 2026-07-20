import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LM Board",
    short_name: "LM Board",
    description: "Curated benchmark scores for frontier language models.",
    start_url: "/",
    display: "standalone",
    background_color: "#f9f9f7",
    theme_color: "#0d0d0d",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
