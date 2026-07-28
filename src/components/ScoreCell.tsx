import { Badge } from "@/components/Badge";
import type { LeaderboardClientScore } from "@/lib/data";
import { formatScore } from "@/lib/format";

type ScoreCellProps = {
  score: LeaderboardClientScore | null;
  isBest: boolean;
  benchmarkName: string;
  centered: boolean;
  featuredOnMobile: boolean;
};

export function ScoreCell({
  score,
  isBest,
  benchmarkName,
  centered,
  featuredOnMobile,
}: ScoreCellProps) {
  if (!score) {
    return (
      // The em dash is silent, so this label is the whole cell to anyone
      // listening — it has to rule out the reading a blank invites, that the
      // model scored zero. "Measured" is also the word the visible copy uses
      // for the same fact, in the ribbon and in the Index coverage line.
      <td
        className={`numeric-cell score-cell missing-value${centered ? " is-centered" : ""}${featuredOnMobile ? " is-mobile-sort-score" : ""}`}
        aria-label="Not measured"
      >
        {featuredOnMobile ? (
          <span className="mobile-score-label">{benchmarkName}</span>
        ) : null}
        —
      </td>
    );
  }

  const scoreNumber = (
    <span className="score-number">{formatScore(score.value)}</span>
  );

  return (
    <td
      className={`numeric-cell score-cell${isBest ? " is-best" : ""}${centered ? " is-centered" : ""}${featuredOnMobile ? " is-mobile-sort-score" : ""}`}
    >
      {featuredOnMobile ? (
        <span className="mobile-score-label">{benchmarkName}</span>
      ) : null}
      {score.selfReported ? (
        <span className="score-value-line">
          {scoreNumber}
          <Badge tone="warn" title="Reported by the model's maker">
            <span aria-hidden="true">Vendor</span>
            <span className="sr-only">Self-reported score</span>
          </Badge>
        </span>
      ) : (
        scoreNumber
      )}
    </td>
  );
}
