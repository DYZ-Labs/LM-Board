import type { MetadataRoute } from "next";

import { loadLeaderboardData } from "@/lib/data";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const data = loadLeaderboardData();

  return [
    {
      url: siteUrl,
      lastModified: data.lastUpdated,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/methodology`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/compare`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // One entry per model record. These are the citation surfaces, so they
    // carry the dataset's own freshness stamp.
    ...data.rows.map((row) => ({
      url: `${siteUrl}/model/${row.model.id}`,
      lastModified: data.lastUpdated,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
