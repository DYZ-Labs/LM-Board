import type { MetadataRoute } from "next";

import { loadLeaderboardData } from "@/lib/data";
import { catalogFreshness, modelRecordFreshness, siteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const data = loadLeaderboardData();

  return [
    {
      url: siteUrl,
      lastModified: catalogFreshness(data),
      changeFrequency: "weekly",
      priority: 1,
    },
    // Google ignores changefreq and priority and treats lastmod as its only
    // freshness signal, so a page without one is a page it has no reason to
    // recrawl. These catalog surfaces re-render whenever their inputs move.
    {
      url: `${siteUrl}/methodology`,
      lastModified: data.lastUpdated,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/compare`,
      lastModified: catalogFreshness(data),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/choose`,
      lastModified: catalogFreshness(data),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    // One entry per model record. These are the citation surfaces, so they
    // carry their own newest retrieval rather than borrowing an unrelated
    // board-wide update. Scoreless records use their release date.
    ...data.rows.map((row) => ({
      url: `${siteUrl}/model/${row.model.id}`,
      lastModified: modelRecordFreshness(row).lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
