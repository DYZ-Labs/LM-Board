import { describe, expect, it } from "vitest";

import { RANK_SCOPES } from "./categories";
import { benchmarksForScope } from "./index";
import { loadLeaderboardData } from "./data";

describe("production ranking integrity", () => {
  const data = loadLeaderboardData();

  it.each(RANK_SCOPES)("ranks every curated model in %s", (scope) => {
    const unranked = data.rows
      .filter((row) => row.scopes[scope].rank === null)
      .map((row) => row.model.id);

    expect(unranked).toEqual([]);
    for (const row of data.rows) {
      expect(row.scopes[scope].index).not.toBeNull();
      expect(row.scopes[scope].rankedFieldSize).toBe(data.rows.length);
    }
  });

  it.each(RANK_SCOPES)(
    "assigns %s ranks in descending Index order with competition ties",
    (scope) => {
      const ranked = data.rows
        .map((row) => {
          const summary = row.scopes[scope];

          if (summary.index === null) {
            throw new Error(`${row.model.id} has no ${scope} Index`);
          }

          return {
            index: Number(summary.index.toFixed(6)),
            rank: summary.rank,
          };
        })
        .sort((left, right) => right.index - left.index);
      let expectedRank = 0;
      let previousIndex: number | null = null;

      ranked.forEach(({ index, rank }, position) => {
        if (previousIndex === null || index !== previousIndex) {
          expectedRank = position + 1;
          previousIndex = index;
        }

        expect(rank).toBe(expectedRank);
      });
    },
  );

  it("builds every estimated Index from a complete measured-plus-estimated scope", () => {
    for (const row of data.rows) {
      for (const scope of RANK_SCOPES) {
        const summary = row.scopes[scope];
        const scopeBenchmarks = benchmarksForScope(data.benchmarks, scope);
        const missingCount = scopeBenchmarks.filter(
          (benchmark) => row.scoresByBenchmark[benchmark.id] === null,
        ).length;

        expect(summary.coverageCount + summary.estimatedCount).toBe(
          summary.coverageTotal,
        );
        expect(summary.estimatedCount).toBe(missingCount);
      }
    }
  });
});
