import type { LeaderboardRow } from "@/lib/data";

function normalizeUrl(url: string | undefined) {
  const normalized = url?.trim().replace(/\/$/, "");
  return normalized || null;
}

const vercelHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

const resolvedSiteUrl =
  normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
  (vercelHost ? `https://${vercelHost}` : "http://localhost:3000");

if (
  process.env.NODE_ENV === "production" &&
  resolvedSiteUrl === "http://localhost:3000"
) {
  throw new Error(
    "Production builds require NEXT_PUBLIC_SITE_URL or a Vercel deployment URL; refusing to use http://localhost:3000 for public metadata.",
  );
}

export const siteUrl = resolvedSiteUrl;
export const repositoryUrl = normalizeUrl(
  process.env.NEXT_PUBLIC_GITHUB_REPOSITORY_URL,
);
export const issuesUrl = repositoryUrl ? `${repositoryUrl}/issues` : null;

export type ModelRecordFreshness = {
  /** Earliest score retrieval represented by this record, when it has scores. */
  firstScoreRetrieved: string | null;
  /** Latest score retrieval represented by this record, when it has scores. */
  latestScoreRetrieved: string | null;
  /**
   * Best record-local date available for sitemap and Dataset freshness.
   * A score retrieval is when the record's evidence changed; a scoreless
   * record falls back to its own release date rather than borrowing an
   * unrelated board-wide update.
   */
  lastModified: string;
};

/**
 * One definition of per-record freshness for metadata, sitemap, JSON-LD and
 * the Atom snapshot. Keeping it here prevents a model with old evidence from
 * inheriting the newest retrieval anywhere else on the board.
 */
export function modelRecordFreshness(
  row: Pick<LeaderboardRow, "model" | "scoresByBenchmark">,
): ModelRecordFreshness {
  const retrieved = Object.values(row.scoresByBenchmark)
    .filter((score) => score != null)
    .map((score) => score.source.retrieved)
    .sort();
  const firstScoreRetrieved = retrieved.at(0) ?? null;
  const latestScoreRetrieved = retrieved.at(-1) ?? null;

  return {
    firstScoreRetrieved,
    latestScoreRetrieved,
    lastModified: latestScoreRetrieved ?? row.model.releaseDate,
  };
}
