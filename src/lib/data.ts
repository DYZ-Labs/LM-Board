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
  /**
   * Models that clear the coverage bar in this scope — the denominator `rank`
   * was measured against. It rides on the scope so no surface can render a
   * rank without the field it means anything relative to.
   */
  rankedFieldSize: number;
};

/** The measured span of one benchmark across the whole dataset. */
export type BenchmarkDomain = {
  min: number;
  max: number;
};

/** The rank-1 model of a scope, flattened for a headline. */
export type LeaderboardLeader = {
  modelId: string;
  name: string;
  lab: string;
  index: number;
  coverageCount: number;
  coverageTotal: number;
  estimatedCount: number;
  rankedFieldSize: number;
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
};

export type LeaderboardData = {
  rows: LeaderboardRow[];
  benchmarks: Benchmark[];
  labs: string[];
  /** Latest score-source retrieval; pricing freshness is tracked separately. */
  lastUpdated: string;
  /** Latest first-party pricing retrieval represented in the model catalog. */
  latestPricingRetrieved: string | null;
  scoreCount: number;
  /**
   * Keyed by benchmark id, over every score in the dataset. A bar that encodes
   * standing within a benchmark has to be scaled by the whole measured field —
   * scaling it by whichever rows a client happens to be holding would make the
   * same score draw a different length on a filtered board.
   */
  benchmarkDomains: Record<string, BenchmarkDomain>;
  /** Earliest retrieval date in the dataset; `lastUpdated` is the latest. */
  oldestRetrieved: string;
  selfReportedCount: number;
};

/**
 * The board only renders a score's value and publisher qualification.
 * Sources, retrieval dates, and evaluation settings live on the model record
 * pages; sending them for all 456 homepage cells would duplicate evidence the
 * non-interactive table cannot expose.
 */
export type LeaderboardClientScore = Pick<Score, "value" | "selfReported">;

export type LeaderboardClientModel = Omit<Model, "pricing"> & {
  pricing?: Pick<NonNullable<Model["pricing"]>, "input" | "output">;
};

export type LeaderboardClientRow = Omit<
  LeaderboardRow,
  "model" | "scoresByBenchmark"
> & {
  model: LeaderboardClientModel;
  scoresByBenchmark: Record<string, LeaderboardClientScore | null>;
};

export type LeaderboardClientData = Pick<
  LeaderboardData,
  "benchmarks" | "labs" | "benchmarkDomains"
> & {
  rows: LeaderboardClientRow[];
  /**
   * Rebuilt on expansion rather than transmitted: the ranks it is read off are
   * already on the wire, so sending it again would only repeat them.
   */
  leadersByScope: Record<RankScope, LeaderboardLeader | null>;
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
let cachedLeaderboardData: LeaderboardData | null = null;

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
  if (cachedLeaderboardData !== null) return cachedLeaderboardData;

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
  const benchmarkDomains: Record<string, BenchmarkDomain> = {};
  let oldestRetrieved = "";
  let selfReportedCount = 0;

  for (const score of scores) {
    const modelScores = scoresByModel.get(score.modelId) ?? [];
    modelScores.push(score);
    scoresByModel.set(score.modelId, modelScores);

    const domain = benchmarkDomains[score.benchmarkId];

    if (domain === undefined) {
      benchmarkDomains[score.benchmarkId] = {
        min: score.value,
        max: score.value,
      };
    } else {
      domain.min = Math.min(domain.min, score.value);
      domain.max = Math.max(domain.max, score.value);
    }

    if (oldestRetrieved === "" || score.source.retrieved < oldestRetrieved) {
      oldestRetrieved = score.source.retrieved;
    }

    if (score.selfReported) selfReportedCount += 1;
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
            rankedFieldSize: 0,
          },
        ];
      }),
    ) as Record<RankScope, LeaderboardScope>;
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
          rankedFieldSize: ranksByScope[scope].size,
        },
      ]),
    ) as Record<RankScope, LeaderboardScope>;

    return {
      ...row,
      scopes,
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
  const latestPricingRetrieved = models.reduce<string | null>(
    (latest, model) => {
      const retrieved = model.pricing?.source.retrieved;
      if (!retrieved) return latest;
      return latest === null || retrieved > latest ? retrieved : latest;
    },
    null,
  );

  cachedLeaderboardData = {
    rows,
    benchmarks,
    labs,
    lastUpdated,
    latestPricingRetrieved,
    scoreCount: scores.length,
    benchmarkDomains,
    oldestRetrieved,
    selfReportedCount,
  };

  return cachedLeaderboardData;
}
