import type { Benchmark, Score } from "@/lib/schema";

export const MIN_INDEX_COVERAGE = 0.6;

export type RankScope = "overall" | Benchmark["category"];

export const RANK_SCOPES = [
  "overall",
  "reasoning",
  "coding",
  "math",
  "agentic",
] as const satisfies readonly RankScope[];

export type IndexResult = {
  value: number | null;
  scoredCount: number;
  totalCount: number;
  coverage: number;
};

export function benchmarksForScope(
  benchmarks: readonly Benchmark[],
  scope: RankScope,
) {
  return scope === "overall"
    ? benchmarks
    : benchmarks.filter((benchmark) => benchmark.category === scope);
}

export function calculateLmBoardIndex(
  scores: readonly Score[],
  benchmarks: readonly Benchmark[],
): IndexResult {
  const eligibleBenchmarkIds = new Set(
    benchmarks
      .filter((benchmark) => benchmark.unit === "percent")
      .map((benchmark) => benchmark.id),
  );
  const values = scores
    .filter((score) => eligibleBenchmarkIds.has(score.benchmarkId))
    .map((score) => score.value);
  const totalCount = eligibleBenchmarkIds.size;
  const scoredCount = values.length;
  const coverage = totalCount === 0 ? 0 : scoredCount / totalCount;
  const qualifies =
    totalCount > 0 &&
    scoredCount >= Math.ceil(totalCount * MIN_INDEX_COVERAGE);

  return {
    value: qualifies
      ? values.reduce((total, value) => total + value, 0) / scoredCount
      : null,
    scoredCount,
    totalCount,
    coverage,
  };
}
