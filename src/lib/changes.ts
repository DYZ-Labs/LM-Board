import type { LeaderboardData } from "@/lib/data";
import { daysSince } from "@/lib/format";

export type ChangeSummary = {
  /** Scores whose retrieval date is the dataset's most recent. */
  refreshedScores: number;
  /** Models released within the recency window. */
  recentModels: number;
  /** Providers represented in the dataset. */
  providers: number;
  lastUpdated: string;
  /**
   * The ends of the retrieval window. `refreshedScores` counts only the last
   * day of it, which understates a dataset collected inside a fortnight; the
   * window is the honest claim and the stronger one.
   */
  oldestRetrieved: string;
  newestRetrieved: string;
  /** Scores the model's own maker published, rather than an independent run. */
  selfReportedCount: number;
};

const RECENT_RELEASE_DAYS = 45;

/**
 * Derived from the dataset rather than from git history: Vercel builds from a
 * shallow clone, so `git log` on data/scores.json is not reliably available,
 * and a summary that silently degrades to "0 changes" is worse than none.
 */
export function summarizeChanges(data: LeaderboardData): ChangeSummary {
  const asOf = new Date(`${data.lastUpdated}T00:00:00Z`);

  const refreshedScores = data.rows.reduce((total, row) => {
    const rowScores = Object.values(row.scoresByBenchmark).filter(
      (score) => score?.source.retrieved === data.lastUpdated,
    );

    return total + rowScores.length;
  }, 0);

  const recentModels = data.rows.filter(
    (row) => daysSince(row.model.releaseDate, asOf) <= RECENT_RELEASE_DAYS,
  ).length;

  return {
    refreshedScores,
    recentModels,
    providers: data.labs.length,
    lastUpdated: data.lastUpdated,
    oldestRetrieved: data.oldestRetrieved,
    newestRetrieved: data.lastUpdated,
    selfReportedCount: data.selfReportedCount,
  };
}
