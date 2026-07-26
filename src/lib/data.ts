import benchmarksJson from "../../data/benchmarks.json";
import modelsJson from "../../data/models.json";
import scoresJson from "../../data/scores.json";

import { validateDataIntegrity } from "@/lib/dataIntegrity";
import {
  RANK_SCOPES,
  benchmarksForScope,
  buildBenchmarkDistributions,
  calculateLmBoardIndex,
  estimateMissingScores,
  type RankScope,
} from "@/lib/index";
import { rampStep, type RampStep } from "@/lib/ramp";
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
  estimatedCount: number;
};

export type LeaderboardRow = {
  model: Model;
  reasoningEffort: string | null;
  reasoningEffortLabel: ReasoningEffortLabel | null;
  scoresByBenchmark: Record<string, Score | null>;
  /**
   * Luminance step per benchmark, precomputed at build time from that
   * benchmark's own distribution. Derived data, so it lives with the row
   * rather than being recomputed on every client render.
   */
  rampByBenchmark: Record<string, RampStep | null>;
  scopes: Record<RankScope, LeaderboardScope>;
  index: number | null;
  coverageCount: number;
  coverageTotal: number;
  coverageRatio: number;
  estimatedCount: number;
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

// Indexes are quantised before they are compared for ranking, so that floating
// point noise in an average cannot split two models that scored identically.
const RANK_PRECISION = 6;

function quantizeIndex(value: number) {
  return Number(value.toFixed(RANK_PRECISION));
}

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

  const distributions = buildBenchmarkDistributions(scores, benchmarks);
  const rowsWithoutRanks: LeaderboardRow[] = models.map((model) => {
    const modelScores = scoresByModel.get(model.id) ?? [];
    const reasoningEffort = modelScores[0]?.reasoningEffort ?? null;
    const scoreLookup = new Map(
      modelScores.map((score) => [score.benchmarkId, score]),
    );
    const estimatedScores = estimateMissingScores(
      modelScores,
      benchmarks,
      distributions,
    );
    const scopes = Object.fromEntries(
      RANK_SCOPES.map((scope) => {
        const indexResult = calculateLmBoardIndex(
          modelScores,
          benchmarksForScope(benchmarks, scope),
          estimatedScores,
        );

        return [
          scope,
          {
            index: indexResult.value,
            rank: null,
            coverageCount: indexResult.scoredCount,
            coverageTotal: indexResult.totalCount,
            coverageRatio: indexResult.coverage,
            estimatedCount: indexResult.estimatedCount,
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
      rampByBenchmark: Object.fromEntries(
        benchmarks.map((benchmark) => {
          const score = scoreLookup.get(benchmark.id);

          return [
            benchmark.id,
            score ? rampStep(distributions, benchmark.id, score.value) : null,
          ];
        }),
      ),
      scopes,
      index: overallScope.index,
      coverageCount: overallScope.coverageCount,
      coverageTotal: overallScope.coverageTotal,
      coverageRatio: overallScope.coverageRatio,
      estimatedCount: overallScope.estimatedCount,
      rank: null,
    } satisfies LeaderboardRow;
  });

  const ranksByScope = Object.fromEntries(
    RANK_SCOPES.map((scope) => {
      const rankedRows = rowsWithoutRanks
        .filter((row) => row.scopes[scope].index !== null)
        .map((row) => ({
          row,
          index: quantizeIndex(row.scopes[scope].index as number),
        }))
        .sort(
          (left, right) =>
            right.index - left.index ||
            nameCollator.compare(left.row.model.name, right.row.model.name),
        );
      const ranks = new Map<string, number>();
      let currentRank = 0;
      let previousIndex: number | null = null;

      // Standard competition ranking: models with an identical index share a
      // rank, and the next distinct index skips the ranks the tie consumed.
      rankedRows.forEach(({ row, index }, position) => {
        if (previousIndex === null || index !== previousIndex) {
          currentRank = position + 1;
          previousIndex = index;
        }

        ranks.set(row.model.id, currentRank);
      });

      return [scope, ranks];
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
