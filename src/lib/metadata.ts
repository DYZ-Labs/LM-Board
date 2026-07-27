import type { Metadata } from "next";

import { loadLeaderboardData } from "@/lib/data";
import { formatScore } from "@/lib/format";
import type { LeaderboardRow } from "@/lib/data";
import { modelRecordFreshness } from "@/lib/site";

/**
 * Next merges a route's `openGraph` with the layout's by replacing it wholesale,
 * so a route that sets a partial one silently drops the inherited image and
 * every route that sets none inherits the layout's `url` — which is how 62 model
 * pages shipped with no `og:image` and two pages claimed to be the homepage.
 * The fix is that no route hand-writes a partial: they all go through here, and
 * this returns a complete card every time.
 */
export type PageMetadataInput = {
  /** Exactly what goes in `<title>`, `og:title` and `twitter:title`. */
  title: string;
  description: string;
  /** Site-absolute path; becomes the canonical and `og:url`. */
  path: string;
  /** Site-absolute path to the 1200×630 card. */
  image: string;
  imageAlt: string;
  /** Record-local cache key; defaults to the board's newest score retrieval. */
  imageVersion?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
};

/**
 * An unfurler caches an image by URL forever, so a card whose numbers moved
 * needs a new URL or Slack keeps showing last month's board. A query key is
 * deliberate here: `public/og` is atomically replaced during a static build,
 * while the root layout still needs the stable `/og/home.png` fallback. A
 * content-addressed directory would either break that fallback or require
 * retaining every historical card in the export. Vercel's cache key includes
 * the query, so this changes the unfurl URL without duplicating 65+ PNGs.
 */
function versionedImage(image: string, version: string) {
  const separator = image.includes("?") ? "&" : "?";
  return `${image}${separator}v=${encodeURIComponent(version)}`;
}

export function pageMetadata(input: PageMetadataInput): Metadata {
  const {
    title,
    description,
    path,
    image,
    imageAlt,
    imageVersion = loadLeaderboardData().lastUpdated,
    type = "website",
    publishedTime,
    modifiedTime,
  } = input;
  const imageUrl = versionedImage(image, imageVersion);

  return {
    // Absolute, so the layout's "%s — LM Board" template cannot append a second
    // brand suffix to a title that already carries one.
    title: { absolute: title },
    description,
    // `alternates` is replaced wholesale by the merge too, so the feed's
    // autodiscovery link has to be restated here or every routed page loses the
    // one the layout declares.
    alternates: {
      canonical: path,
      types: {
        "application/atom+xml": [
          { url: "/feed.xml", title: "LM Board — model data feed" },
        ],
      },
    },
    openGraph: {
      type,
      url: path,
      siteName: "LM Board",
      locale: "en_US",
      title,
      description,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: imageAlt,
          type: "image/png",
        },
      ],
      ...(type === "article" ? { publishedTime, modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

/** Site-absolute path to a model's card. Also the generator's output path. */
export function modelCardPath(modelId: string) {
  return `/og/model/${modelId}.png`;
}

const MAX_DESCRIPTION = 155;

/**
 * Google truncates a description near 155 characters, and a sentence cut
 * mid-word reads as a broken page rather than a dense one.
 */
export function truncateDescription(value: string, limit = MAX_DESCRIPTION) {
  if (value.length <= limit) return value;

  const clipped = value.slice(0, limit - 1);
  const lastSpace = clipped.lastIndexOf(" ");

  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).replace(/[\s,.;:·—-]+$/, "")}…`;
}

/**
 * The standing sentence a model page leads with, in both its description and
 * its card alt text: numerals first, because that is what the numbers-led
 * queries this page exists to answer are looking for.
 */
export function modelStanding(row: LeaderboardRow) {
  const scope = row.scopes.overall;

  if (scope.index === null) {
    return `Not ranked: ${scope.coverageCount} of ${scope.coverageTotal} benchmarks measured, below the coverage bar the Index needs.`;
  }

  const rank =
    scope.rank === null
      ? ""
      : `, rank ${scope.rank} of ${scope.rankedFieldSize}`;

  return `Overall Index ${formatScore(scope.index)}${rank}, ${scope.coverageCount} of ${scope.coverageTotal} benchmarks measured.`;
}

/** Metadata for `/model/[id]`, derived so it cannot go stale. */
export function modelPageMetadata(row: LeaderboardRow): Metadata {
  const standing = modelStanding(row);
  const freshness = modelRecordFreshness(row);

  return pageMetadata({
    // "benchmark scores" is the query people type; the old title was the bare
    // model name, which carried no benchmark term at all.
    title: `${row.model.name} benchmark scores — LM Board`,
    description: truncateDescription(
      `${standing} Every measured score links to its source and retrieval date. ${row.model.name} by ${row.model.lab}.`,
    ),
    path: `/model/${row.model.id}`,
    image: modelCardPath(row.model.id),
    imageAlt: `${row.model.name} — ${standing}`,
    imageVersion: freshness.lastModified,
    // This is a data record, not an article. The model's release date describes
    // the model entity and must not become `article:published_time` for this
    // page. Record dates live in the sitemap and Dataset JSON-LD instead.
    type: "website",
  });
}
