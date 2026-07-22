import benchmarksJson from "../../data/benchmarks.json";
import modelsJson from "../../data/models.json";
import scoresJson from "../../data/scores.json";

import { validateDataIntegrity } from "@/lib/dataIntegrity";
import {
  RANK_SCOPES,
  benchmarksForScope,
  calculateLmBoardIndex,
  type RankScope,
} from "@/lib/index";
import {
  BenchmarksFileSchema,
  ModelsFileSchema,
  ScoresFileSchema,
  type Benchmark,
  type Model,
  type Score,
} from "@/lib/schema";

export type LeaderboardScope = {
  index: number | null;
  rank: number | null;
  coverageCount: number;
  coverageTotal: number;
  coverageRatio: number;
};

export type LeaderboardRow = {
  model: Model;
  reasoningEffort: string | null;
  reasoningEffortLabel: ReasoningEffortLabel | null;
  scoresByBenchmark: Record<string, Score | null>;
  scopes: Record<RankScope, LeaderboardScope>;
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
  scoreCount: number;
};

export type ReasoningEffortLabel =
  | "max"
  | "high"
  | "xhigh"
  | "adaptive"
  | "reasoning";

const nameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function summarizeReasoningEffort(
  reasoningEffort: string | null,
): ReasoningEffortLabel | null {
  if (!reasoningEffort) return null;

  const normalized = reasoningEffort.toLocaleLowerCase("en");

  if (normalized.includes("xhigh")) return "xhigh";
  if (normalized.includes("max")) return "max";
  if (normalized.includes("high")) return "high";
  if (normalized.includes("adaptive")) return "adaptive";
  return "reasoning";
}

export function loadLeaderboardData(): LeaderboardData {
  const models = ModelsFileSchema.parse(modelsJson);
  const benchmarks = BenchmarksFileSchema.parse(benchmarksJson);
  const scores = ScoresFileSchema.parse(scoresJson);
  const integrityErrors = validateDataIntegrity(models, benchmarks, scores);

  if (integrityErrors.length > 0) {
    throw new Error(
      `Data integrity validation failed\n${integrityErrors
        .map((error) => `  - ${error}`)
        .join("\n")}`,
    );
  }

  const scoresByModel = new Map<string, Score[]>();

  for (const score of scores) {
    const modelScores = scoresByModel.get(score.modelId) ?? [];
    modelScores.push(score);
    scoresByModel.set(score.modelId, modelScores);
  }

  const rowsWithoutRanks: LeaderboardRow[] = models.map((model) => {
    const modelScores = scoresByModel.get(model.id) ?? [];
    const reasoningEffort = modelScores[0]?.reasoningEffort ?? null;
    const scoreLookup = new Map(
      modelScores.map((score) => [score.benchmarkId, score]),
    );
    const scopes = Object.fromEntries(
      RANK_SCOPES.map((scope) => {
        const indexResult = calculateLmBoardIndex(
          modelScores,
          benchmarksForScope(benchmarks, scope),
        );

        return [
          scope,
          {
            index: indexResult.value,
            rank: null,
            coverageCount: indexResult.scoredCount,
            coverageTotal: indexResult.totalCount,
            coverageRatio: indexResult.coverage,
          },
        ];
      }),
    ) as Record<RankScope, LeaderboardScope>;
    const overallScope = scopes.overall;

    return {
      model,
      reasoningEffort,
      reasoningEffortLabel: summarizeReasoningEffort(reasoningEffort),
      scoresByBenchmark: Object.fromEntries(
        benchmarks.map((benchmark) => [
          benchmark.id,
          scoreLookup.get(benchmark.id) ?? null,
        ]),
      ),
      scopes,
      index: overallScope.index,
      coverageCount: overallScope.coverageCount,
      coverageTotal: overallScope.coverageTotal,
      coverageRatio: overallScope.coverageRatio,
      rank: null,
    } satisfies LeaderboardRow;
  });

  const ranksByScope = Object.fromEntries(
    RANK_SCOPES.map((scope) => {
      const rankedRows = rowsWithoutRanks
        .filter((row) => row.scopes[scope].index !== null)
        .sort((left, right) => {
          const leftIndex = left.scopes[scope].index as number;
          const rightIndex = right.scopes[scope].index as number;

          return (
            rightIndex - leftIndex ||
            nameCollator.compare(left.model.name, right.model.name)
          );
        });

      return [
        scope,
        new Map(rankedRows.map((row, index) => [row.model.id, index + 1])),
      ];
    }),
  ) as Record<RankScope, Map<string, number>>;
  const rows = rowsWithoutRanks.map((row) => {
    const scopes = Object.fromEntries(
      RANK_SCOPES.map((scope) => [
        scope,
        {
          ...row.scopes[scope],
          rank: ranksByScope[scope].get(row.model.id) ?? null,
        },
      ]),
    ) as Record<RankScope, LeaderboardScope>;

    return {
      ...row,
      scopes,
      rank: scopes.overall.rank,
    };
  });
  const labs = [...new Set(models.map((model) => model.lab))].sort((a, b) =>
    nameCollator.compare(a, b),
  );
  const lastUpdated = scores.reduce(
    (latest, score) =>
      score.source.retrieved > latest ? score.source.retrieved : latest,
    "",
  );

  return {
    rows,
    benchmarks,
    labs,
    lastUpdated,
    scoreCount: scores.length,
  };
}
