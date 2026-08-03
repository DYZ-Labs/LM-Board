import type { RankScope } from "@/lib/categories";
import type { Benchmark, Score } from "@/lib/schema";

export { RANK_SCOPES, type RankScope } from "@/lib/categories";

export const MIN_INDEX_COVERAGE = 0.6;
export const LM_INDEX_LABEL = "LM Intelligence Index";
export const LM_INDEX_EXPANDED_LABEL = "LM Intelligence Index";

export type IndexResult = {
  value: number | null;
  scoredCount: number;
  totalCount: number;
  coverage: number;
  estimatedCount: number;
};

/** Ascending measured values per percent benchmark; the basis for every estimate. */
export type BenchmarkDistributions = ReadonlyMap<string, readonly number[]>;

/** Benchmark id to estimated value, for benchmarks a model has no score on. */
export type EstimatedScores = ReadonlyMap<string, number>;

/**
 * The coverage bar for a set of benchmarks: how many measured scores a model
 * needs before it is ranked. Shared by the board's Index tooltip and the
 * methodology page so the two can never quote different numbers.
 */
export function coverageThreshold(benchmarks: readonly Benchmark[]) {
  const percentBenchmarkCount = benchmarks.filter(
    (benchmark) => benchmark.unit === "percent",
  ).length;

  return {
    percentBenchmarkCount,
    minimumCoverageCount: Math.ceil(percentBenchmarkCount * MIN_INDEX_COVERAGE),
  };
}

export function benchmarksForScope(
  benchmarks: readonly Benchmark[],
  scope: RankScope,
) {
  return scope === "overall"
    ? benchmarks
    : benchmarks.filter((benchmark) => benchmark.category === scope);
}

export function buildBenchmarkDistributions(
  scores: readonly Score[],
  benchmarks: readonly Benchmark[],
): BenchmarkDistributions {
  const distributions = new Map<string, number[]>(
    benchmarks
      .filter((benchmark) => benchmark.unit === "percent")
      .map((benchmark) => [benchmark.id, []]),
  );

  for (const score of scores) {
    distributions.get(score.benchmarkId)?.push(score.value);
  }

  for (const values of distributions.values()) {
    values.sort((left, right) => left - right);
  }

  return distributions;
}

/**
 * Mean-rank percentile: a value shares the midpoint of the range its ties
 * occupy, so a model is placed neither above nor below the models it scored
 * exactly level with.
 */
export function percentileOf(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sorted[middle] < value) low = middle + 1;
    else high = middle;
  }

  const below = low;
  high = sorted.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sorted[middle] <= value) low = middle + 1;
    else high = middle;
  }

  const equal = low - below;
  return (below + equal / 2) / sorted.length;
}

/** Inverse of percentileOf, interpolating between adjacent observations. */
function valueAtPercentile(
  sorted: readonly number[],
  percentile: number,
): number {
  const position = Math.min(1, Math.max(0, percentile)) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

/**
 * Estimates the benchmarks a model has no measurement for, so that skipping a
 * benchmark cannot lift a model's Index above models that were measured on it.
 * A gap is filled at the model's average percentile across the benchmarks it
 * *was* measured on, read off the missing benchmark's own distribution.
 *
 * Pass every benchmark and every score the model has, not a single scope's:
 * estimating from the full picture keeps one gap resolving to the same value on
 * the Overall tab and on its category tab.
 */
export function estimateMissingScores(
  modelScores: readonly Score[],
  benchmarks: readonly Benchmark[],
  distributions: BenchmarkDistributions,
): EstimatedScores {
  const measured = new Map(
    modelScores.map((score) => [score.benchmarkId, score.value]),
  );
  const percentiles: number[] = [];

  for (const [benchmarkId, value] of measured) {
    const sorted = distributions.get(benchmarkId);

    if (sorted && sorted.length > 0) {
      percentiles.push(percentileOf(sorted, value));
    }
  }

  const estimates = new Map<string, number>();

  if (percentiles.length === 0) return estimates;

  const modelPercentile =
    percentiles.reduce((total, percentile) => total + percentile, 0) /
    percentiles.length;

  for (const benchmark of benchmarks) {
    if (benchmark.unit !== "percent" || measured.has(benchmark.id)) continue;

    const sorted = distributions.get(benchmark.id);

    if (!sorted || sorted.length === 0) continue;

    estimates.set(benchmark.id, valueAtPercentile(sorted, modelPercentile));
  }

  return estimates;
}

export function calculateLmBoardIndex(
  scores: readonly Score[],
  benchmarks: readonly Benchmark[],
  estimatedScores: EstimatedScores,
  options: { allowCompleteEstimatedIndex?: boolean } = {},
): IndexResult {
  const eligibleBenchmarkIds = new Set(
    benchmarks
      .filter((benchmark) => benchmark.unit === "percent")
      .map((benchmark) => benchmark.id),
  );
  const measured = new Map(
    scores
      .filter((score) => eligibleBenchmarkIds.has(score.benchmarkId))
      .map((score) => [score.benchmarkId, score.value]),
  );
  const totalCount = eligibleBenchmarkIds.size;
  const scoredCount = measured.size;
  const coverage = totalCount === 0 ? 0 : scoredCount / totalCount;
  const clearsMeasuredGate =
    totalCount > 0 &&
    scoredCount >= Math.ceil(totalCount * MIN_INDEX_COVERAGE);

  if (!clearsMeasuredGate && !options.allowCompleteEstimatedIndex) {
    return { value: null, scoredCount, totalCount, coverage, estimatedCount: 0 };
  }

  // Overall coverage can qualify a model for a category whose remaining values
  // are all estimable. The fallback must produce a complete category Index: a
  // partial estimate would reward whichever benchmark happens to be present.
  const values: number[] = [];
  let estimatedCount = 0;

  for (const benchmarkId of eligibleBenchmarkIds) {
    const measuredValue = measured.get(benchmarkId);

    if (measuredValue !== undefined) {
      values.push(measuredValue);
      continue;
    }

    const estimate = estimatedScores.get(benchmarkId);

    if (estimate === undefined) continue;

    values.push(estimate);
    estimatedCount += 1;
  }

  if (
    values.length === 0 ||
    (!clearsMeasuredGate && values.length !== totalCount)
  ) {
    return { value: null, scoredCount, totalCount, coverage, estimatedCount: 0 };
  }

  return {
    value: values.reduce((total, value) => total + value, 0) / values.length,
    scoredCount,
    totalCount,
    coverage,
    estimatedCount,
  };
}
