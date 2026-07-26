import Link from "next/link";

import { FreshnessChip } from "@/components/FreshnessChip";
import type { LeaderboardRow } from "@/lib/data";
import { formatScore } from "@/lib/format";

type ReadoutProps = {
  leader: LeaderboardRow | null;
  lastUpdated: string;
};

/**
 * The board's own top answer, given away before the visitor does any work.
 * This is the LCP element: text in a preloaded font, no image, and its box is
 * reserved by a fixed line-height so it cannot shift.
 */
export function Readout({ leader, lastUpdated }: ReadoutProps) {
  if (!leader || leader.index === null) {
    return (
      <div className="readout">
        <p className="readout-eyebrow">
          <span>Leading model</span>
          <FreshnessChip date={lastUpdated} />
        </p>
        <p className="readout-lab">
          No model currently clears the coverage threshold for an Overall Index.
        </p>
      </div>
    );
  }

  return (
    <div className="readout readout-parallax">
      <p className="readout-eyebrow">
        <span>Leading the Overall Index</span>
        <FreshnessChip date={lastUpdated} />
      </p>
      <div className="readout-body">
        <h2 className="readout-name">
          <Link href={`/model/${leader.model.id}`}>{leader.model.name}</Link>
        </h2>
        <p className="readout-value num">
          {formatScore(leader.index)}
          <span className="unit">index</span>
        </p>
      </div>
      <p className="readout-lab">
        {leader.model.lab} · {leader.coverageCount} of {leader.coverageTotal}{" "}
        benchmarks measured
        {leader.estimatedCount > 0
          ? ` · ${leader.estimatedCount} estimated`
          : null}
      </p>
    </div>
  );
}
