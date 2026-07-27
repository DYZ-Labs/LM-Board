import Link from "next/link";

import { FreshnessChip } from "@/components/FreshnessChip";
import type { LeaderboardRow } from "@/lib/data";
import { formatScore } from "@/lib/format";

type ReadoutProps = {
  leader: LeaderboardRow | null;
  lastUpdated: string;
};

/**
 * The page title and the board's top answer, before the visitor does any work.
 * Both are text in preloaded faces, so the whole hero is fast, selectable and
 * stable without spending the first viewport on decoration.
 */
export function Readout({ leader, lastUpdated }: ReadoutProps) {
  const overall = leader?.scopes.overall;

  return (
    <div className="readout">
      <h1 className="readout-title" id="leaderboard-heading">
        Frontier model benchmark index
      </h1>
      {!leader || !overall || overall.index === null ? (
        <div className="readout-empty">
          <p className="readout-eyebrow">Current leader</p>
          <FreshnessChip date={lastUpdated} />
          <p className="readout-lab">
            No model currently clears the coverage threshold for an Overall
            Index.
          </p>
        </div>
      ) : (
        <div className="readout-leader">
          <p className="readout-eyebrow">Current leader</p>
          <FreshnessChip date={lastUpdated} />
          <div className="readout-score">
            <p className="readout-value">{formatScore(overall.index)}</p>
            <p className="readout-unit">Overall Index</p>
          </div>
          <div className="readout-identity">
            <h2 className="readout-name">
              <Link href={`/model/${leader.model.id}`} prefetch={false}>
                {leader.model.name}
              </Link>
            </h2>
            <p className="readout-lab">
              {leader.model.lab} · equal-weight mean of {overall.coverageTotal}{" "}
              benchmarks, 0–100 · {overall.coverageCount} measured
              {overall.estimatedCount > 0
                ? `, ${overall.estimatedCount} estimated`
                : null}
            </p>
          </div>
          <Link className="readout-more" href="/methodology" prefetch={false}>
            How the Index works
          </Link>
        </div>
      )}
    </div>
  );
}
