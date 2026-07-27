import { rankScopeLabel } from "@/lib/categories";
import { loadLeaderboardData } from "@/lib/data";
import { formatScore } from "@/lib/format";
import type { RankScope } from "@/lib/index";
import { distributionFor, normalizeToRange } from "@/lib/visualization";

type FieldStripProps = {
  scope: RankScope;
  modelId: string;
};

/**
 * Where this model sits in the field it was ranked against — every ranked
 * Index in the scope as a hairline tick, this one picked out.
 *
 * A rank is unreadable without its distribution: "29.1, rank 3" says nothing
 * about whether rank 2 is a hair above or twenty points above. Server-rendered
 * from the same build-time data as the number beside it, so it costs the
 * client nothing and can never disagree with the rank it annotates.
 */
export function FieldStrip({ scope, modelId }: FieldStripProps) {
  const { rows } = loadLeaderboardData();
  const field = rows
    .map((row) => ({ id: row.model.id, ...row.scopes[scope] }))
    .filter((entry) => entry.rank !== null && entry.index !== null);

  if (field.length < 2) return null;

  const values = field.map((entry) => entry.index!);
  const self = field.find((entry) => entry.id === modelId);

  if (self === undefined) return null;

  const distribution = distributionFor(values, self.index!);
  if (!distribution || distribution.max === distribution.min) return null;

  const { min, q1, median, q3, max, percentile } = distribution;
  const xOf = (value: number) =>
    1 + normalizeToRange(value, min, max) * 98;
  const selfX = xOf(self.index!).toFixed(2);
  const q1X = xOf(q1);
  const q3X = xOf(q3);
  const medianX = xOf(median).toFixed(2);

  return (
    <dd className="record-field">
      <svg
        className="field-strip"
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="field-baseline"
          d="M1 10H99"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          className="field-quartiles"
          x={q1X}
          y="6"
          width={Math.max(1, q3X - q1X)}
          height="8"
          rx="2"
        />
        <path
          className="field-median"
          d={`M${medianX} 4v12`}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="field-self-ring"
          d={`M${selfX} 2v16`}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="field-self"
          d={`M${selfX} 2v16`}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="field-ends num" aria-hidden="true">
        <span>{formatScore(min)}</span>
        <span>Median {formatScore(median)}</span>
        <span>{formatScore(max)}</span>
      </span>
      <span className="sr-only">
        {formatScore(self.index!)} is at approximately the{" "}
        {Math.round(percentile)}th percentile of the ranked{" "}
        {rankScopeLabel(scope)} field. The field spans {formatScore(min)} to{" "}
        {formatScore(max)}, with a median of {formatScore(median)}.
      </span>
    </dd>
  );
}
