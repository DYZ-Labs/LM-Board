import { RANK_SCOPES, type RankScope } from "@/lib/categories";
import type {
  BenchmarkDomain,
  LeaderboardClientData,
  LeaderboardClientRow,
  LeaderboardData,
  LeaderboardLeader,
  LeaderboardScope,
  ReasoningEffortLabel,
} from "@/lib/data";
import type { RampStep } from "@/lib/ramp";
import type { Model } from "@/lib/schema";

type ScorePayload = readonly [
  value: number,
  sourceUrlIndex: number,
  retrievedDateIndex: number,
  settingsIndex: number | null,
  selfReported: 0 | 1,
];

type ScopePayload = readonly [
  index: number | null,
  rank: number | null,
  coverageCount: number,
  coverageTotal: number,
  estimatedCount: number,
];

type ModelPayload = readonly [
  id: string,
  name: string,
  labIndex: number,
  releaseDate: string,
  openWeights: 0 | 1,
  contextWindow: number | null,
  inputPrice: number | null,
  outputPrice: number | null,
  url: string,
];

type RowPayload = readonly [
  model: ModelPayload,
  reasoningEffort: string | null,
  reasoningEffortLabel: ReasoningEffortLabel | null,
  scores: readonly (ScorePayload | null)[],
  ramps: readonly (RampStep | null)[],
  scopes: readonly ScopePayload[],
];

type DomainPayload = readonly [min: number, max: number];

const ARTIFICIAL_ANALYSIS_MODEL_PREFIX =
  "https://artificialanalysis.ai/models/";
const ARTIFICIAL_ANALYSIS_BREAKDOWN_SUFFIX = "#intelligence-breakdown";
const COMPRESSED_SOURCE_PREFIX = "@";

function encodeSourceReference(url: string) {
  if (
    url.startsWith(ARTIFICIAL_ANALYSIS_MODEL_PREFIX) &&
    url.endsWith(ARTIFICIAL_ANALYSIS_BREAKDOWN_SUFFIX)
  ) {
    return `${COMPRESSED_SOURCE_PREFIX}${url.slice(
      ARTIFICIAL_ANALYSIS_MODEL_PREFIX.length,
      -ARTIFICIAL_ANALYSIS_BREAKDOWN_SUFFIX.length,
    )}`;
  }

  return url;
}

function decodeSourceReference(reference: string) {
  return reference.startsWith(COMPRESSED_SOURCE_PREFIX)
    ? `${ARTIFICIAL_ANALYSIS_MODEL_PREFIX}${reference.slice(1)}${ARTIFICIAL_ANALYSIS_BREAKDOWN_SUFFIX}`
    : reference;
}

/**
 * A normalized wire format for the server-to-client boundary. Tuples are
 * aligned with `benchmarks` and `RANK_SCOPES`; repeated source URLs, dates,
 * settings, benchmark ids, and object keys are transmitted only once.
 */
export type LeaderboardClientPayload = {
  benchmarks: LeaderboardData["benchmarks"];
  labs: string[];
  /**
   * Aligned with `benchmarks`; null where a benchmark has no measured score.
   * The one derived quantity that is transmitted rather than recomputed on the
   * client: it scales a graphical mark, so it must describe the whole dataset
   * and not merely the rows this payload happens to carry.
   */
  domains: (DomainPayload | null)[];
  /**
   * Unique source references. Artificial Analysis model breakdown URLs use
   * `@slug` on the wire; expansion restores the full public URL. The common
   * origin/path/fragment otherwise consumed several kilobytes of first-load
   * Flight data without adding information.
   */
  sourceRefs: string[];
  retrievedDates: string[];
  settings: string[];
  rows: RowPayload[];
};

function indexByValue(values: readonly string[]): Map<string, number> {
  return new Map(values.map((value, index) => [value, index]));
}

export function toLeaderboardClientPayload(
  data: LeaderboardData,
): LeaderboardClientPayload {
  const scores = data.rows.flatMap((row) =>
    Object.values(row.scoresByBenchmark).filter((score) => score !== null),
  );
  const sourceUrls = [...new Set(scores.map((score) => score.source.url))];
  const retrievedDates = [
    ...new Set(scores.map((score) => score.source.retrieved)),
  ];
  const settings = [
    ...new Set(
      scores
        .map((score) => score.settings)
        .filter((value): value is string => value !== undefined),
    ),
  ];
  const sourceUrlIndexes = indexByValue(sourceUrls);
  const retrievedDateIndexes = indexByValue(retrievedDates);
  const settingsIndexes = indexByValue(settings);
  const labIndexes = indexByValue(data.labs);

  return {
    benchmarks: data.benchmarks,
    labs: data.labs,
    domains: data.benchmarks.map((benchmark) => {
      const domain = data.benchmarkDomains[benchmark.id];

      return domain === undefined
        ? null
        : ([domain.min, domain.max] satisfies DomainPayload);
    }),
    sourceRefs: sourceUrls.map(encodeSourceReference),
    retrievedDates,
    settings,
    rows: data.rows.map(
      (row) =>
        [
          [
            row.model.id,
            row.model.name,
            labIndexes.get(row.model.lab)!,
            row.model.releaseDate,
            row.model.openWeights ? 1 : 0,
            row.model.contextWindow ?? null,
            row.model.pricing?.input ?? null,
            row.model.pricing?.output ?? null,
            row.model.url,
          ] satisfies ModelPayload,
          row.reasoningEffort,
          row.reasoningEffortLabel,
          data.benchmarks.map((benchmark) => {
            const score = row.scoresByBenchmark[benchmark.id];
            if (score === null) return null;

            return [
              score.value,
              sourceUrlIndexes.get(score.source.url)!,
              retrievedDateIndexes.get(score.source.retrieved)!,
              score.settings === undefined
                ? null
                : settingsIndexes.get(score.settings)!,
              score.selfReported ? 1 : 0,
            ] satisfies ScorePayload;
          }),
          data.benchmarks.map((benchmark) => row.rampByBenchmark[benchmark.id]),
          RANK_SCOPES.map((scope) => {
            const entry = row.scopes[scope];

            return [
              entry.index,
              entry.rank,
              entry.coverageCount,
              entry.coverageTotal,
              entry.estimatedCount,
            ] satisfies ScopePayload;
          }),
        ] satisfies RowPayload,
    ),
  };
}

export function expandLeaderboardClientPayload(
  payload: LeaderboardClientPayload,
): LeaderboardClientData {
  // One constant per scope, counted off ranks that are already on the wire.
  // Transmitting it would mean repeating the same five numbers on every row.
  const rankedFieldSizes = RANK_SCOPES.map((_scope, scopeIndex) =>
    payload.rows.reduce((total, [, , , , , scopes]) => {
      const [, rank] = scopes[scopeIndex]!;

      return rank === null ? total : total + 1;
    }, 0),
  );
  const rows: LeaderboardClientRow[] = payload.rows.map((rowPayload) => {
    const [
      modelPayload,
      reasoningEffort,
      reasoningEffortLabel,
      scores,
      ramps,
      scopes,
    ] = rowPayload;
    const [
      id,
      name,
      labIndex,
      releaseDate,
      openWeights,
      contextWindow,
      inputPrice,
      outputPrice,
      url,
    ] = modelPayload;
    const model: Model = {
      id,
      name,
      lab: payload.labs[labIndex]!,
      releaseDate,
      openWeights: openWeights === 1,
      ...(contextWindow === null ? {} : { contextWindow }),
      ...(inputPrice === null || outputPrice === null
        ? {}
        : { pricing: { input: inputPrice, output: outputPrice } }),
      url,
    };

    return {
      model,
      reasoningEffort,
      reasoningEffortLabel,
      scoresByBenchmark: Object.fromEntries(
        payload.benchmarks.map((benchmark, index) => {
          const score = scores[index];
          if (score === null) return [benchmark.id, null];

          const [
            value,
            sourceUrlIndex,
            retrievedDateIndex,
            settingsIndex,
            selfReported,
          ] = score;

          return [
            benchmark.id,
            {
              value,
              source: {
                url: decodeSourceReference(payload.sourceRefs[sourceUrlIndex]!),
                retrieved: payload.retrievedDates[retrievedDateIndex]!,
              },
              ...(settingsIndex === null
                ? {}
                : { settings: payload.settings[settingsIndex]! }),
              selfReported: selfReported === 1,
            },
          ];
        }),
      ),
      rampByBenchmark: Object.fromEntries(
        payload.benchmarks.map((benchmark, index) => [
          benchmark.id,
          ramps[index] ?? null,
        ]),
      ),
      scopes: Object.fromEntries(
        RANK_SCOPES.map((scope, index) => {
          const [
            scopeIndex,
            rank,
            coverageCount,
            coverageTotal,
            estimatedCount,
          ] = scopes[index]!;
          const entry: LeaderboardScope = {
            index: scopeIndex,
            rank,
            coverageCount,
            coverageTotal,
            coverageRatio:
              coverageTotal === 0 ? 0 : coverageCount / coverageTotal,
            estimatedCount,
            rankedFieldSize: rankedFieldSizes[index]!,
          };

          return [scope, entry];
        }),
      ) as LeaderboardClientRow["scopes"],
    };
  });

  return {
    benchmarks: payload.benchmarks,
    labs: payload.labs,
    benchmarkDomains: Object.fromEntries(
      payload.benchmarks.flatMap((benchmark, index) => {
        const domain = payload.domains[index];

        return domain
          ? [[benchmark.id, { min: domain[0], max: domain[1] }] as const]
          : [];
      }),
    ) satisfies Record<string, BenchmarkDomain>,
    leadersByScope: Object.fromEntries(
      RANK_SCOPES.map((scope) => [scope, leaderOfScope(rows, scope)]),
    ) as Record<RankScope, LeaderboardLeader | null>,
    rows,
  };
}

/**
 * Row order, not ranking order, so a tie at the top resolves to the same model
 * the server picked for the static headline.
 */
function leaderOfScope(
  rows: readonly LeaderboardClientRow[],
  scope: RankScope,
): LeaderboardLeader | null {
  const row = rows.find(({ scopes }) => scopes[scope].rank === 1);

  if (row === undefined) return null;

  const entry = row.scopes[scope];

  return {
    modelId: row.model.id,
    name: row.model.name,
    lab: row.model.lab,
    index: entry.index ?? 0,
    coverageCount: entry.coverageCount,
    coverageTotal: entry.coverageTotal,
    estimatedCount: entry.estimatedCount,
    rankedFieldSize: entry.rankedFieldSize,
  };
}
