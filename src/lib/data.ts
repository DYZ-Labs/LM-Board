import benchmarksJson from "../../data/benchmarks.json";
import modelsJson from "../../data/models.json";
import scoresJson from "../../data/scores.json";

import { calculateLmBoardIndex } from "@/lib/index";
import {
  BenchmarksFileSchema,
  ModelsFileSchema,
  ScoresFileSchema,
  type Benchmark,
  type Model,
  type Score,
} from "@/lib/schema";

export type LeaderboardRow = {
  model: Model;
  reasoningEffort: string | null;
  scoresByBenchmark: Record<string, Score | null>;
  index: number | null;
  coverageCount: number;
  coverageTotal: number;
  coverageRatio: number;
  rank: number | null;
};

export type LeaderboardData = {
  rows: LeaderboardRow[];
  benchmarks: Benchmark[];
  labs: string[];
  lastUpdated: string;
};

const nameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function loadLeaderboardData(): LeaderboardData {
  const models = ModelsFileSchema.parse(modelsJson);
  const benchmarks = BenchmarksFileSchema.parse(benchmarksJson);
  const scores = ScoresFileSchema.parse(scoresJson);
  const modelsById = new Map(models.map((model) => [model.id, model]));
  const benchmarksById = new Map(
    benchmarks.map((benchmark) => [benchmark.id, benchmark]),
  );
  const scoresByModel = new Map<string, Score[]>();
  const scorePairs = new Set<string>();

  if (modelsById.size !== models.length) {
    throw new Error("Model IDs must be unique");
  }

  if (benchmarksById.size !== benchmarks.length) {
    throw new Error("Benchmark IDs must be unique");
  }

  for (const score of scores) {
    if (!modelsById.has(score.modelId)) {
      throw new Error(`Score references unknown model: ${score.modelId}`);
    }

    if (!benchmarksById.has(score.benchmarkId)) {
      throw new Error(
        `Score references unknown benchmark: ${score.benchmarkId}`,
      );
    }

    const pair = `${score.modelId}::${score.benchmarkId}`;
    if (scorePairs.has(pair)) {
      throw new Error(`Duplicate model/benchmark score: ${pair}`);
    }

    scorePairs.add(pair);
    const modelScores = scoresByModel.get(score.modelId) ?? [];
    modelScores.push(score);
    scoresByModel.set(score.modelId, modelScores);
  }

  for (const [modelId, modelScores] of scoresByModel) {
    const reasoningEfforts = new Set(
      modelScores.map((score) => score.reasoningEffort ?? null),
    );

    if (reasoningEfforts.size > 1) {
      throw new Error(
        `Scores for model "${modelId}" must all use the same reasoningEffort or all omit it`,
      );
    }
  }

  const rowsWithoutRanks: LeaderboardRow[] = models.map((model) => {
    const modelScores = scoresByModel.get(model.id) ?? [];
    const scoreLookup = new Map(
      modelScores.map((score) => [score.benchmarkId, score]),
    );
    const indexResult = calculateLmBoardIndex(modelScores, benchmarks);

    return {
      model,
      reasoningEffort: modelScores[0]?.reasoningEffort ?? null,
      scoresByBenchmark: Object.fromEntries(
        benchmarks.map((benchmark) => [
          benchmark.id,
          scoreLookup.get(benchmark.id) ?? null,
        ]),
      ),
      index: indexResult.value,
      coverageCount: indexResult.scoredCount,
      coverageTotal: indexResult.totalCount,
      coverageRatio: indexResult.coverage,
      rank: null,
    } satisfies LeaderboardRow;
  });

  const rankedRows = rowsWithoutRanks
    .filter(
      (row): row is LeaderboardRow & { index: number } => row.index !== null,
    )
    .sort(
      (left, right) =>
        right.index - left.index ||
        nameCollator.compare(left.model.name, right.model.name),
    );
  const ranksByModelId = new Map(
    rankedRows.map((row, index) => [row.model.id, index + 1]),
  );
  const rows = rowsWithoutRanks.map((row) => ({
    ...row,
    rank: ranksByModelId.get(row.model.id) ?? null,
  }));
  const labs = [...new Set(models.map((model) => model.lab))].sort((a, b) =>
    nameCollator.compare(a, b),
  );
  const lastUpdated = scores.reduce(
    (latest, score) =>
      score.source.retrieved > latest ? score.source.retrieved : latest,
    "",
  );

  return { rows, benchmarks, labs, lastUpdated };
}
