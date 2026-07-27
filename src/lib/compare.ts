import type { LeaderboardData } from "@/lib/data";

export type CompareBenchmark = {
  id: string;
  name: string;
};

export type CompareScore = {
  value: number;
  sourceUrl: string;
  retrieved: string;
};

export type CompareRow = {
  id: string;
  name: string;
  lab: string;
  releaseDate: string;
  openWeights: boolean;
  pricing: {
    input: number;
    output: number;
  } | null;
  overallIndex: number | null;
  scoresByBenchmark: Partial<Record<string, CompareScore>>;
};

export type CompareData = {
  rows: CompareRow[];
  benchmarks: CompareBenchmark[];
};

type CompareScorePayload = readonly [
  value: number,
  sourceRefIndex: number,
  retrievedDateIndex: number,
];

type CompareRowPayload = readonly [
  id: string,
  name: string,
  lab: string,
  releaseDate: string,
  openWeights: 0 | 1,
  pricing: readonly [input: number, output: number] | null,
  overallIndex: number | null,
  scores: readonly (CompareScorePayload | null)[],
];

export type ComparePayload = {
  benchmarks: readonly (readonly [id: string, name: string])[];
  sourceRefs: readonly string[];
  retrievedDates: readonly string[];
  rows: readonly CompareRowPayload[];
};

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
 * The comparison is a client component, but it needs only a small subset of the
 * leaderboard. Keeping the projection here prevents ranking scopes, ramps,
 * model metadata, and unused score fields from entering the route's Flight
 * payload.
 */
export function toCompareData(
  data: Pick<LeaderboardData, "rows" | "benchmarks">,
): CompareData {
  const benchmarks = data.benchmarks.map(({ id, name }) => ({ id, name }));

  return {
    benchmarks,
    rows: data.rows.map((row) => ({
      id: row.model.id,
      name: row.model.name,
      lab: row.model.lab,
      releaseDate: row.model.releaseDate,
      openWeights: row.model.openWeights,
      pricing: row.model.pricing
        ? {
            input: row.model.pricing.input,
            output: row.model.pricing.output,
          }
        : null,
      overallIndex: row.scopes.overall.index,
      scoresByBenchmark: Object.fromEntries(
        benchmarks.flatMap(({ id }) => {
          const score = row.scoresByBenchmark[id];
          return score
            ? [
                [
                  id,
                  {
                    value: score.value,
                    sourceUrl: score.source.url,
                    retrieved: score.source.retrieved,
                  },
                ],
              ]
            : [];
        }),
      ),
    })),
  };
}

/**
 * Normalize repeated benchmark ids, object keys, source URLs and dates before
 * crossing the server/client boundary. The compare route needs every model in
 * its picker, but it does not need to repeat the same source URL eight times
 * for that model in static HTML.
 */
export function packCompareData(data: CompareData): ComparePayload {
  const scores = data.rows.flatMap((row) =>
    Object.values(row.scoresByBenchmark).filter(
      (score): score is CompareScore => score !== undefined,
    ),
  );
  const sourceUrls = [...new Set(scores.map((score) => score.sourceUrl))];
  const retrievedDates = [...new Set(scores.map((score) => score.retrieved))];
  const sourceIndexes = new Map(
    sourceUrls.map((source, index) => [source, index]),
  );
  const retrievedIndexes = new Map(
    retrievedDates.map((date, index) => [date, index]),
  );

  return {
    benchmarks: data.benchmarks.map(({ id, name }) => [id, name]),
    sourceRefs: sourceUrls.map(encodeSourceReference),
    retrievedDates,
    rows: data.rows.map((row) => [
      row.id,
      row.name,
      row.lab,
      row.releaseDate,
      row.openWeights ? 1 : 0,
      row.pricing ? [row.pricing.input, row.pricing.output] : null,
      row.overallIndex,
      data.benchmarks.map(({ id }) => {
        const score = row.scoresByBenchmark[id];
        return score
          ? [
              score.value,
              sourceIndexes.get(score.sourceUrl)!,
              retrievedIndexes.get(score.retrieved)!,
            ]
          : null;
      }),
    ]),
  };
}

export function toComparePayload(
  data: Pick<LeaderboardData, "rows" | "benchmarks">,
) {
  return packCompareData(toCompareData(data));
}

export function expandComparePayload(payload: ComparePayload): CompareData {
  const benchmarks = payload.benchmarks.map(([id, name]) => ({ id, name }));

  return {
    benchmarks,
    rows: payload.rows.map(
      ([
        id,
        name,
        lab,
        releaseDate,
        openWeights,
        pricing,
        overallIndex,
        scores,
      ]) => ({
        id,
        name,
        lab,
        releaseDate,
        openWeights: openWeights === 1,
        pricing: pricing
          ? { input: pricing[0], output: pricing[1] }
          : null,
        overallIndex,
        scoresByBenchmark: Object.fromEntries(
          benchmarks.flatMap((benchmark, index) => {
            const score = scores[index];
            if (score === null) return [];

            return [
              [
                benchmark.id,
                {
                  value: score[0],
                  sourceUrl: decodeSourceReference(
                    payload.sourceRefs[score[1]]!,
                  ),
                  retrieved: payload.retrievedDates[score[2]]!,
                },
              ],
            ];
          }),
        ),
      }),
    ),
  };
}
