import type { Benchmark, Model, Score } from "@/lib/schema";

function findDuplicateIds(
  records: Array<{ id: string }>,
  label: string,
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const record of records) {
    if (seen.has(record.id)) {
      duplicates.add(record.id);
    }
    seen.add(record.id);
  }

  return [...duplicates].map((id) => `Duplicate ${label} id: ${id}`);
}

export function validateDataIntegrity(
  models: Model[],
  benchmarks: Benchmark[],
  scores: Score[],
): string[] {
  const errors = [
    ...findDuplicateIds(models, "model"),
    ...findDuplicateIds(benchmarks, "benchmark"),
  ];
  const modelIds = new Set(models.map(({ id }) => id));
  const benchmarkById = new Map(
    benchmarks.map((benchmark) => [benchmark.id, benchmark]),
  );
  const measuredBenchmarkIds = new Set<string>();
  const scorePairs = new Set<string>();
  const reasoningEffortsByModel = new Map<string, Set<string | null>>();

  for (const [index, score] of scores.entries()) {
    const prefix = `scores.json[${index}]`;
    const pair = `${score.modelId}::${score.benchmarkId}`;

    if (!modelIds.has(score.modelId)) {
      errors.push(`${prefix}: unknown modelId "${score.modelId}"`);
    }

    const benchmark = benchmarkById.get(score.benchmarkId);
    if (!benchmark) {
      errors.push(`${prefix}: unknown benchmarkId "${score.benchmarkId}"`);
    } else {
      measuredBenchmarkIds.add(benchmark.id);

      if (
        benchmark.unit === "percent" &&
        (score.value < 0 || score.value > 100)
      ) {
        errors.push(
          `${prefix}: percent value ${score.value} must be between 0 and 100`,
        );
      }
    }

    if (scorePairs.has(pair)) {
      errors.push(
        `${prefix}: duplicate score pair (${score.modelId}, ${score.benchmarkId})`,
      );
    }
    scorePairs.add(pair);

    const reasoningEfforts =
      reasoningEffortsByModel.get(score.modelId) ?? new Set();
    reasoningEfforts.add(score.reasoningEffort ?? null);
    reasoningEffortsByModel.set(score.modelId, reasoningEfforts);
  }

  for (const benchmark of benchmarkById.values()) {
    if (!measuredBenchmarkIds.has(benchmark.id)) {
      errors.push(`Benchmark "${benchmark.id}" has no score measurements`);
    }
  }

  for (const [modelId, reasoningEfforts] of reasoningEffortsByModel) {
    if (reasoningEfforts.size > 1) {
      errors.push(
        `Scores for model "${modelId}" must all use the same reasoningEffort or all omit it`,
      );
    }
  }

  return errors;
}
