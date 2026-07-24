import { Badge } from "@/components/Badge";
import type { Benchmark, Score } from "@/lib/schema";

const scoreFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type ScoreCellProps = {
  score: Score | null;
  isBest: boolean;
  unit: Benchmark["unit"];
};

export function ScoreCell({ score, isBest, unit }: ScoreCellProps) {
  if (!score) {
    return (
      <td className="numeric-cell missing-value" aria-label="No curated score">
        —
      </td>
    );
  }

  const barWidth =
    unit === "percent" ? Math.min(100, Math.max(0, score.value)) : null;

  return (
    <td className={`numeric-cell score-cell${isBest ? " is-best" : ""}`}>
      <div className="score-value-line">
        <span className="score-number">
          {scoreFormatter.format(score.value)}
        </span>
        {isBest ? (
          <span className="best-marker">
            <span className="best-dot" aria-hidden="true" />
            <span className="sr-only">Best score in this column</span>
          </span>
        ) : null}
        {score.selfReported ? (
          <Badge className="score-report-badge">
            <span aria-hidden="true">Vendor</span>
            <span className="sr-only">Self-reported score</span>
          </Badge>
        ) : null}
      </div>
      {barWidth === null ? null : (
        <span className="score-bar" aria-hidden="true">
          <span className="score-bar-fill" style={{ width: `${barWidth}%` }} />
        </span>
      )}
    </td>
  );
}
