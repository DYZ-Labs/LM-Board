import type { CSSProperties } from "react";

import { Badge } from "@/components/Badge";
import { ExternalIcon } from "@/components/Icon";
import { formatDate, formatScore } from "@/lib/format";
import { rampFill, type RampStep } from "@/lib/ramp";
import type { Benchmark, Score } from "@/lib/schema";

type ScoreCellProps = {
  score: Score | null;
  isBest: boolean;
  unit: Benchmark["unit"];
  ramp: RampStep | null;
  benchmarkName: string;
};

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

export function ScoreCell({
  score,
  isBest,
  unit,
  ramp,
  benchmarkName,
}: ScoreCellProps) {
  if (!score) {
    return (
      <td className="numeric-cell missing-value" aria-label="No curated score">
        —
      </td>
    );
  }

  // Bar length encodes the absolute value; the luminance step encodes standing
  // within the column. Two readings of one hue — see lib/ramp.ts.
  const style = {
    "--score-step": `var(--score-${ramp ?? 3})`,
    "--score-fill": unit === "percent" ? rampFill(score.value) : 0,
  } as CSSProperties;

  return (
    <td
      className={`numeric-cell score-cell${isBest ? " is-best" : ""}`}
      style={style}
    >
      <div className="score-value-line">
        <span className="score-number">{formatScore(score.value)}</span>
        {isBest ? (
          <span className="best-marker">
            <span className="best-dot" aria-hidden="true" />
            <span className="sr-only">Best score in this column</span>
          </span>
        ) : null}
        {score.selfReported ? (
          <Badge tone="warn" title="Reported by the model's maker">
            <span aria-hidden="true">Vendor</span>
            <span className="sr-only">Self-reported score</span>
          </Badge>
        ) : null}
      </div>
      {/* Provenance at the number rather than behind a click: the citation is
          the product, and it used to be invisible on the board. */}
      <a
        className="source-chip"
        href={score.source.url}
        target="_blank"
        rel="noreferrer"
        // The row header already supplies the model name to assistive tech in a
        // table context, so naming it again here only bloats the markup — this
        // label ships 456 times.
        aria-label={`Source for ${benchmarkName}: ${hostLabel(score.source.url)}, retrieved ${formatDate(score.source.retrieved)}`}
      >
        <ExternalIcon size={9} />
        {formatDate(score.source.retrieved)}
      </a>
    </td>
  );
}
