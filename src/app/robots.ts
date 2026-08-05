import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/llms.txt"],
      // `output: "export"` also emits a .txt RSC payload beside every HTML page
      // — one for each page route. List only those duplicate surfaces instead
      // of blocking every text file, because `/llms.txt` is a canonical public
      // artifact in its own right.
      disallow: [
        "/index.txt",
        "/404.txt",
        "/compare.txt",
        "/methodology.txt",
        "/model/*.txt$",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
